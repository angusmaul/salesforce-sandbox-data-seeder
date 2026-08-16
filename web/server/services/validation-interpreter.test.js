/**
 * Tests for validation-rule interpretation (prompt construction + response
 * mapping — no AI calls).
 */

const { buildSystemPrompt, buildUserPrompt, mapResponse } = require('./validation-interpreter');

const RULES_BY_OBJECT = {
  Account: [
    {
      fullName: 'Account.Active_Required',
      objectName: 'Account',
      ruleName: 'Active_Required',
      errorConditionFormula: "ISPICKVAL(Active__c, 'No') || ISBLANK(TEXT(Active__c))",
      errorMessage: 'Active is required to be Yes when creating accounts'
    },
    {
      fullName: 'Account.Complex_Rule',
      objectName: 'Account',
      ruleName: 'Complex_Rule',
      errorConditionFormula: '$User.ProfileId <> "00e..."',
      errorMessage: 'Only admins may do this'
    }
  ]
};

const FIELD_ANALYSIS = {
  Account: {
    fields: [
      { name: 'Active__c', label: 'Active', type: 'picklist', createable: true, picklistValues: [{ value: 'Yes', active: true }, { value: 'No', active: true }] },
      { name: 'Name', label: 'Account Name', type: 'string', length: 255, createable: true }
    ]
  }
};

describe('prompt construction', () => {
  test('system prompt explains inversion and allowed types only', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('FALSE');
    expect(prompt).toContain('fixedValue');
    expect(prompt).toContain('picklistSubset');
    expect(prompt).toContain('unsupported');
  });

  test('user prompt includes rules, formulas, and field metadata', () => {
    const prompt = buildUserPrompt(RULES_BY_OBJECT, FIELD_ANALYSIS);
    expect(prompt).toContain('Object: Account');
    expect(prompt).toContain('Active_Required');
    expect(prompt).toContain('ISPICKVAL');
    expect(prompt).toContain('Active__c');
    expect(prompt).toContain('fieldConstraints');
  });
});

describe('mapResponse', () => {
  test('merges per-rule constraints and filters unsupported to known rules', () => {
    const parsed = {
      objects: {
        Account: {
          rules: [
            { ruleName: 'Active_Required', fieldConstraints: { Active__c: { type: 'fixedValue', value: 'Yes' } } },
            { ruleName: 'Empty_Rule', fieldConstraints: {} }
          ],
          unsupported: ['Complex_Rule', 'Hallucinated_Rule']
        }
      }
    };
    const result = mapResponse(parsed, RULES_BY_OBJECT);
    expect(result.Account.fieldConstraints.Active__c).toEqual({ type: 'fixedValue', value: 'Yes' });
    expect(result.Account.rules.length).toBe(1); // empty-constraint rule dropped
    expect(result.Account.unsupported).toEqual(['Complex_Rule']); // hallucinated one filtered
  });

  test('returns null for garbage responses', () => {
    expect(mapResponse(null, RULES_BY_OBJECT)).toBeNull();
    expect(mapResponse({ nope: true }, RULES_BY_OBJECT)).toBeNull();
  });
});
