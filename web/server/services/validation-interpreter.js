/**
 * Validation-rule interpreter
 *
 * Feeds active validation rules (formula + error message) plus field metadata
 * to the configured AI provider and gets back enforceable field constraints
 * (see lib/field-constraints.js for the constraint schema). Rules the model
 * can't express in that schema are reported as `unsupported` so the UI can
 * suggest the disable-rules strategy instead.
 */

const { callModel } = require('./ai-providers');
const { parseJSONLoose, compactField } = require('./ai-field-mapper');

function buildSystemPrompt() {
  return `You are a Salesforce expert. You translate validation rules into field constraints for a test-data generator.

A validation rule REJECTS a record when its errorConditionFormula evaluates to TRUE. Your job: for each rule, produce constraints that guarantee the formula evaluates to FALSE, so generated records pass.

Allowed constraint types (use ONLY these):
- { "type": "fixedValue", "value": <value> }            — field must equal value
- { "type": "picklistSubset", "values": [<values>] }    — field must be one of values
- { "type": "range", "min": <n>, "max": <n> }           — numeric bounds (min/max optional)
- { "type": "notNull" }                                  — field must be populated
- { "type": "maxLength", "value": <n> }                  — string length cap

Rules:
1. Only produce a constraint when you are confident it satisfies the rule for ALL generated records. Prefer the simplest constraint that works.
2. Use exact field API names from the provided metadata, and exact picklist values from the field's value list.
3. If a rule involves cross-field logic, record types, user context, or anything not expressible with the allowed types, list its ruleName under "unsupported" instead of guessing.
4. Respond with ONLY valid JSON. No markdown fences, no explanation.`;
}

function buildUserPrompt(rulesByObject, fieldAnalysis) {
  const sections = Object.entries(rulesByObject).map(([objectName, rules]) => {
    const fields = (fieldAnalysis?.[objectName]?.fields || [])
      .map(compactField)
      .filter(Boolean);
    const ruleList = rules.map(r => ({
      ruleName: r.ruleName,
      errorConditionFormula: r.errorConditionFormula,
      errorMessage: r.errorMessage
    }));
    return `Object: ${objectName}\nValidation rules:\n${JSON.stringify(ruleList, null, 1)}\nFields:\n${JSON.stringify(fields, null, 1)}`;
  });

  return `Translate these validation rules into field constraints.

${sections.join('\n\n---\n\n')}

Return JSON in this exact structure:
{
  "objects": {
    "<ObjectName>": {
      "rules": [
        {
          "ruleName": "<ruleName>",
          "fieldConstraints": { "<FieldApiName>": { "type": "...", ... } }
        }
      ],
      "unsupported": ["<ruleName>", ...]
    }
  }
}`;
}

/** Map the model's response into { [objectName]: { fieldConstraints, rules, unsupported } } */
function mapResponse(parsed, rulesByObject) {
  if (!parsed?.objects) return null;
  const constraints = {};

  for (const [objectName, objResult] of Object.entries(parsed.objects)) {
    const knownRules = new Set((rulesByObject[objectName] || []).map(r => r.ruleName));
    const rules = (objResult.rules || [])
      .filter(r => r && r.fieldConstraints && Object.keys(r.fieldConstraints).length > 0)
      .map(r => ({ ruleName: r.ruleName, fieldConstraints: r.fieldConstraints }));

    // Merged view for the generation-time pass
    const fieldConstraints = {};
    for (const r of rules) {
      Object.assign(fieldConstraints, r.fieldConstraints);
    }

    constraints[objectName] = {
      fieldConstraints,
      rules,
      unsupported: (objResult.unsupported || []).filter(name => knownRules.has(name))
    };
  }

  return constraints;
}

/**
 * Interpret validation rules into field constraints via the configured provider.
 * @param {Object} providerConfig - AI provider config ({ provider, model, ... })
 * @param {Array} rules - [{ objectName, ruleName, errorConditionFormula, errorMessage }]
 * @param {Object} fieldAnalysis - session.fieldAnalysis keyed by objectName
 * @returns {Object|null} constraints keyed by objectName, or null on failure
 */
async function interpretValidationRules(providerConfig, rules, fieldAnalysis) {
  if (!providerConfig || !rules?.length) return null;

  const rulesByObject = {};
  for (const rule of rules) {
    if (!rulesByObject[rule.objectName]) rulesByObject[rule.objectName] = [];
    rulesByObject[rule.objectName].push(rule);
  }

  const text = await callModel(providerConfig, buildSystemPrompt(), buildUserPrompt(rulesByObject, fieldAnalysis));
  if (text == null) return null;

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return mapResponse(parseJSONLoose(cleaned), rulesByObject);
  } catch (err) {
    console.error('Validation-rule interpretation was not parseable JSON:', err.message);
    return null;
  }
}

module.exports = {
  interpretValidationRules,
  // Exported for testing
  buildSystemPrompt,
  buildUserPrompt,
  mapResponse
};
