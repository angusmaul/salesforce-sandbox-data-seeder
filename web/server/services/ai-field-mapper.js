/**
 * AI Field Mapper Service
 *
 * Uses Claude Haiku to classify discovered Salesforce fields into semantic
 * categories from the field-data-library. Runs once after field discovery,
 * caches the result in the session, and every downstream code path falls
 * back gracefully if the AI plan is absent.
 */

const { listAvailableGenerators } = require('../lib/field-data-library');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 3; // objects per Claude call (manages prompt size)
const MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build available categories description for the prompt.
 * @returns {string}
 */
function buildCategoryDescription() {
  const generators = listAvailableGenerators();
  const grouped = {};
  for (const { category, subcategory } of generators) {
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(subcategory);
  }
  return Object.entries(grouped)
    .map(([cat, subs]) => `  ${cat}: ${subs.join(', ')}`)
    .join('\n');
}

/**
 * Prepare a compact field descriptor for the prompt.
 * Only sends the metadata Claude needs for classification.
 * @param {Object} field - Salesforce field metadata
 * @returns {Object|null} compact descriptor or null if field should be skipped
 */
function compactField(field) {
  // Skip non-writable, formula, auto-number fields
  if (
    field.createable === false ||
    field.calculated ||
    field.calculatedFormula ||
    field.autoNumber ||
    field.type === 'calculated' ||
    field.type === 'summary'
  ) {
    return null;
  }

  const desc = {
    name: field.name,
    label: field.label,
    type: field.type?.toLowerCase(),
    length: field.length || undefined,
    required: field.required || false,
    custom: field.custom || field.name?.endsWith('__c') || false
  };

  // Include a few sample picklist values for context
  if ((field.type === 'picklist' || field.type === 'multipicklist') && field.picklistValues) {
    const active = field.picklistValues.filter(pv => pv.active);
    desc.sampleValues = active.slice(0, 5).map(pv => pv.value);
  }

  // Reference target
  if (field.type === 'reference' && field.referenceTo?.length) {
    desc.referenceTo = field.referenceTo;
  }

  return desc;
}

/**
 * Build the system prompt for field classification.
 * @returns {string}
 */
function buildSystemPrompt() {
  return `You are a Salesforce data generation expert. Your task is to classify Salesforce object fields into semantic categories for realistic test data generation.

Available categories and subcategories:
${buildCategoryDescription()}

Rules:
1. For picklist/multipicklist fields, always map to category "picklist", subcategory "picklist". These use their own values.
2. For reference/lookup fields, always map to category "skip", subcategory "reference". These are handled by relationship logic.
3. For boolean fields, map to category "skip", subcategory "boolean". These use existing logic.
4. For custom fields (__c), use the field LABEL (not API name) to infer the best semantic category.
5. Confidence: "high" if the mapping is obvious, "medium" if inferred from label/context, "low" if uncertain.
6. Identify correlations between fields on the same object (e.g., Department + Title, Country + Phone, FirstName + Email).

Correlation types you can identify:
- "department_jobtitle" — department and job title should match
- "country_phone" — phone format should match country
- "name_email" — email should contain the person's name
- "country_address" — state/postal/city should match country
- "company_size" — revenue, employee count, deal sizes should be consistent

Respond with ONLY valid JSON. No markdown fences, no explanation.`;
}

/**
 * Build the user prompt for a batch of objects.
 * @param {Array<{objectName: string, fields: Array}>} batch
 * @returns {string}
 */
function buildUserPrompt(batch) {
  const objectDescriptions = batch.map(({ objectName, fields }) => {
    const compactFields = fields
      .map(compactField)
      .filter(Boolean);

    return `Object: ${objectName}\nFields:\n${JSON.stringify(compactFields, null, 1)}`;
  });

  return `Classify each field into the best semantic category for data generation.

${objectDescriptions.join('\n\n---\n\n')}

Return JSON in this exact structure:
{
  "objects": {
    "<ObjectName>": {
      "fieldMappings": {
        "<FieldApiName>": {
          "category": "<category>",
          "subcategory": "<subcategory>",
          "confidence": "high|medium|low",
          "reason": "<brief reason>"
        }
      },
      "correlations": [
        {
          "type": "<correlation_type>",
          "fields": ["<field1>", "<field2>"]
        }
      ]
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// JSON Repair
// ---------------------------------------------------------------------------

/**
 * Parse JSON with tolerance for common LLM output issues:
 * - Trailing commas in objects and arrays
 * - Single-quoted strings
 * - Unquoted property names
 * @param {string} text - raw JSON-ish string from Claude
 * @returns {Object} parsed object
 * @throws {SyntaxError} if repair fails
 */
function parseJSONLoose(text) {
  // Try strict parse first
  try {
    return JSON.parse(text);
  } catch (_) {
    // Continue to repair
  }

  // Remove trailing commas before } or ]
  let repaired = text.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(repaired);
  } catch (_) {
    // Continue to more aggressive repair
  }

  // Replace single-quoted strings with double-quoted
  // Only replace quotes that look like string delimiters (after : or , or [ or {)
  repaired = repaired.replace(/'/g, '"');

  try {
    return JSON.parse(repaired);
  } catch (_) {
    // Continue
  }

  // Try to extract the JSON object if there's surrounding text
  const match = repaired.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      // Continue
    }

    // One more pass: fix unquoted keys  e.g.  fieldName: "value"  →  "fieldName": "value"
    const fixedKeys = match[0].replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(fixedKeys);
    } catch (err) {
      throw new SyntaxError(`JSON repair failed: ${err.message}`);
    }
  }

  throw new SyntaxError('No JSON object found in response');
}

// ---------------------------------------------------------------------------
// API Call
// ---------------------------------------------------------------------------

/**
 * Call Claude API with the given messages.
 * @param {string} apiKey - Anthropic API key
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Object|null} parsed JSON response or null on failure
 */
async function callClaude(apiKey, systemPrompt, userPrompt) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Strip markdown fences if present
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    return parseJSONLoose(cleaned);
  } catch (err) {
    console.error('Claude API call failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Analyze field schemas using AI and return a generation plan.
 *
 * @param {Object} fieldAnalysis - session.fieldAnalysis keyed by objectName
 * @param {string} apiKey - Anthropic API key (process.env.ANTHROPIC_API_KEY)
 * @returns {Object|null} generation plan keyed by objectName, or null if unavailable
 *
 * Plan structure per object:
 * {
 *   fieldMappings: { [fieldName]: { category, subcategory, confidence, reason } },
 *   correlations: [{ type, fields }]
 * }
 */
async function analyzeFields(fieldAnalysis, apiKey) {
  if (!apiKey) {
    console.log('AI Field Mapper: No API key, skipping AI analysis');
    return null;
  }

  if (!fieldAnalysis || Object.keys(fieldAnalysis).length === 0) {
    console.log('AI Field Mapper: No field analysis data provided');
    return null;
  }

  const objectNames = Object.keys(fieldAnalysis);
  console.log(`AI Field Mapper: Analyzing ${objectNames.length} objects`);

  // Build batches
  const batches = [];
  for (let i = 0; i < objectNames.length; i += BATCH_SIZE) {
    const batchNames = objectNames.slice(i, i + BATCH_SIZE);
    const batch = batchNames.map(name => ({
      objectName: name,
      fields: fieldAnalysis[name]?.fields || []
    }));
    batches.push(batch);
  }

  const systemPrompt = buildSystemPrompt();
  const plan = {};
  let successCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`AI Field Mapper: Processing batch ${batchIndex + 1}/${batches.length} (${batch.map(b => b.objectName).join(', ')})`);

    const userPrompt = buildUserPrompt(batch);
    const result = await callClaude(apiKey, systemPrompt, userPrompt);

    if (result?.objects) {
      for (const [objName, objPlan] of Object.entries(result.objects)) {
        plan[objName] = {
          fieldMappings: objPlan.fieldMappings || {},
          correlations: objPlan.correlations || []
        };
        successCount++;
      }
    } else {
      console.warn(`AI Field Mapper: Batch ${batchIndex + 1} returned no usable data`);
      // Continue processing remaining batches
    }
  }

  if (successCount === 0) {
    console.warn('AI Field Mapper: No objects were successfully analyzed');
    return null;
  }

  console.log(`AI Field Mapper: Successfully analyzed ${successCount}/${objectNames.length} objects`);
  return plan;
}

/**
 * Apply user overrides to an existing AI generation plan.
 * @param {Object} plan - existing plan from analyzeFields()
 * @param {Object} overrides - { objectName: { fieldName: { category, subcategory } } }
 * @returns {Object} merged plan
 */
function applyOverrides(plan, overrides) {
  if (!plan || !overrides) return plan;

  const merged = JSON.parse(JSON.stringify(plan)); // deep clone

  for (const [objName, fieldOverrides] of Object.entries(overrides)) {
    if (!merged[objName]) {
      merged[objName] = { fieldMappings: {}, correlations: [] };
    }
    for (const [fieldName, mapping] of Object.entries(fieldOverrides)) {
      merged[objName].fieldMappings[fieldName] = {
        ...merged[objName].fieldMappings[fieldName],
        ...mapping,
        confidence: 'high',
        reason: 'User override'
      };
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  analyzeFields,
  applyOverrides,
  // Exported for testing
  parseJSONLoose,
  buildSystemPrompt,
  buildUserPrompt,
  buildCategoryDescription,
  compactField,
  callClaude,
  BATCH_SIZE,
  MODEL
};
