/**
 * Tests for AI Field Mapper Service
 *
 * Tests prompt construction, response parsing, and override logic.
 * Does NOT call the real Claude API — tests the transformation logic around it.
 */

const {
  buildSystemPrompt,
  buildUserPrompt,
  buildCategoryDescription,
  compactField,
  analyzeFields,
  applyOverrides,
  BATCH_SIZE,
  MODEL
} = require('./ai-field-mapper');

// ---------------------------------------------------------------------------
// compactField
// ---------------------------------------------------------------------------

describe('compactField', () => {
  test('returns compact descriptor for a writable string field', () => {
    const field = {
      name: 'Custom_Field__c',
      label: 'Custom Field',
      type: 'string',
      length: 255,
      required: false,
      createable: true,
      calculated: false,
      calculatedFormula: null,
      autoNumber: false,
      custom: true
    };

    const result = compactField(field);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Custom_Field__c');
    expect(result.label).toBe('Custom Field');
    expect(result.type).toBe('string');
    expect(result.length).toBe(255);
    expect(result.custom).toBe(true);
    console.log('  compact field:', JSON.stringify(result));
  });

  test('returns null for formula fields', () => {
    expect(compactField({ name: 'FormulaField', calculated: true, createable: true })).toBeNull();
  });

  test('returns null for non-createable fields', () => {
    expect(compactField({ name: 'ReadOnly', createable: false })).toBeNull();
  });

  test('returns null for auto-number fields', () => {
    expect(compactField({ name: 'AutoNum', autoNumber: true, createable: true })).toBeNull();
  });

  test('includes sample picklist values', () => {
    const field = {
      name: 'Status',
      label: 'Status',
      type: 'picklist',
      createable: true,
      picklistValues: [
        { value: 'Open', active: true },
        { value: 'Closed', active: true },
        { value: 'Pending', active: true },
        { value: 'Archived', active: false }
      ]
    };

    const result = compactField(field);
    expect(result.sampleValues).toEqual(['Open', 'Closed', 'Pending']);
    console.log('  picklist sample values:', result.sampleValues);
  });

  test('includes reference target', () => {
    const field = {
      name: 'AccountId',
      label: 'Account',
      type: 'reference',
      createable: true,
      referenceTo: ['Account']
    };

    const result = compactField(field);
    expect(result.referenceTo).toEqual(['Account']);
  });

  test('detects custom fields by __c suffix', () => {
    const field = {
      name: 'My_Field__c',
      label: 'My Field',
      type: 'string',
      createable: true
    };

    const result = compactField(field);
    expect(result.custom).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCategoryDescription
// ---------------------------------------------------------------------------

describe('buildCategoryDescription', () => {
  test('includes all major categories', () => {
    const desc = buildCategoryDescription();
    expect(desc).toContain('person:');
    expect(desc).toContain('company:');
    expect(desc).toContain('address:');
    expect(desc).toContain('financial:');
    expect(desc).toContain('temporal:');
    expect(desc).toContain('content:');
    expect(desc).toContain('communication:');
    expect(desc).toContain('identifier:');
    console.log('  Category description length:', desc.length, 'chars');
    console.log(desc);
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  test('contains classification instructions and categories', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('classify');
    expect(prompt).toContain('person:');
    expect(prompt).toContain('department_jobtitle');
    expect(prompt).toContain('country_phone');
    expect(prompt).toContain('picklist');
    expect(prompt).toContain('skip');
    expect(prompt.length).toBeGreaterThan(500);
    console.log('  System prompt length:', prompt.length, 'chars');
  });
});

// ---------------------------------------------------------------------------
// buildUserPrompt
// ---------------------------------------------------------------------------

describe('buildUserPrompt', () => {
  test('formats objects with field metadata', () => {
    const batch = [
      {
        objectName: 'Account',
        fields: [
          { name: 'Name', label: 'Account Name', type: 'string', length: 255, createable: true },
          { name: 'Industry', label: 'Industry', type: 'picklist', createable: true, picklistValues: [{ value: 'Tech', active: true }] },
          { name: 'AnnualRevenue', label: 'Annual Revenue', type: 'currency', createable: true },
          { name: 'FormulaField', label: 'Formula', type: 'calculated', calculated: true, createable: true }
        ]
      }
    ];

    const prompt = buildUserPrompt(batch);
    expect(prompt).toContain('Object: Account');
    expect(prompt).toContain('Name');
    expect(prompt).toContain('Industry');
    expect(prompt).toContain('AnnualRevenue');
    // Formula field should be excluded by compactField
    expect(prompt).not.toContain('FormulaField');
    expect(prompt).toContain('fieldMappings');
    expect(prompt).toContain('correlations');
    console.log('  User prompt length:', prompt.length, 'chars');
  });

  test('handles multiple objects in a batch', () => {
    const batch = [
      {
        objectName: 'Account',
        fields: [{ name: 'Name', label: 'Name', type: 'string', createable: true }]
      },
      {
        objectName: 'Contact',
        fields: [{ name: 'FirstName', label: 'First Name', type: 'string', createable: true }]
      }
    ];

    const prompt = buildUserPrompt(batch);
    expect(prompt).toContain('Object: Account');
    expect(prompt).toContain('Object: Contact');
  });

  test('handles empty field list gracefully', () => {
    const batch = [{ objectName: 'EmptyObject', fields: [] }];
    const prompt = buildUserPrompt(batch);
    expect(prompt).toContain('Object: EmptyObject');
  });
});

// ---------------------------------------------------------------------------
// applyOverrides
// ---------------------------------------------------------------------------

describe('applyOverrides', () => {
  const basePlan = {
    Account: {
      fieldMappings: {
        Name: { category: 'company', subcategory: 'name', confidence: 'high', reason: 'Standard company name' },
        Industry: { category: 'picklist', subcategory: 'picklist', confidence: 'high', reason: 'Picklist field' }
      },
      correlations: []
    }
  };

  test('overrides a specific field mapping', () => {
    const overrides = {
      Account: {
        Name: { category: 'person', subcategory: 'fullName' }
      }
    };

    const result = applyOverrides(basePlan, overrides);
    expect(result.Account.fieldMappings.Name.category).toBe('person');
    expect(result.Account.fieldMappings.Name.subcategory).toBe('fullName');
    expect(result.Account.fieldMappings.Name.confidence).toBe('high');
    expect(result.Account.fieldMappings.Name.reason).toBe('User override');
    console.log('  Override applied:', JSON.stringify(result.Account.fieldMappings.Name));
  });

  test('preserves unoveridden fields', () => {
    const overrides = {
      Account: {
        Name: { category: 'person', subcategory: 'fullName' }
      }
    };

    const result = applyOverrides(basePlan, overrides);
    expect(result.Account.fieldMappings.Industry.category).toBe('picklist');
  });

  test('does not mutate original plan', () => {
    const overrides = {
      Account: { Name: { category: 'content', subcategory: 'subject' } }
    };

    const result = applyOverrides(basePlan, overrides);
    expect(basePlan.Account.fieldMappings.Name.category).toBe('company');
    expect(result.Account.fieldMappings.Name.category).toBe('content');
  });

  test('adds mapping for new object', () => {
    const overrides = {
      Contact: {
        Email: { category: 'communication', subcategory: 'email' }
      }
    };

    const result = applyOverrides(basePlan, overrides);
    expect(result.Contact).toBeDefined();
    expect(result.Contact.fieldMappings.Email.category).toBe('communication');
  });

  test('returns plan unchanged when overrides is null', () => {
    const result = applyOverrides(basePlan, null);
    expect(result).toEqual(basePlan);
  });

  test('returns plan unchanged when overrides is empty', () => {
    const result = applyOverrides(basePlan, {});
    expect(result).toEqual(basePlan);
  });
});

// ---------------------------------------------------------------------------
// analyzeFields — graceful degradation
// ---------------------------------------------------------------------------

describe('analyzeFields graceful degradation', () => {
  test('returns null when no API key', async () => {
    const result = await analyzeFields({ Account: { fields: [] } }, null);
    expect(result).toBeNull();
    console.log('  No API key → null (graceful)');
  });

  test('returns null when no API key (empty string)', async () => {
    const result = await analyzeFields({ Account: { fields: [] } }, '');
    expect(result).toBeNull();
  });

  test('returns null when no field analysis', async () => {
    const result = await analyzeFields(null, 'sk-fake-key');
    expect(result).toBeNull();
    console.log('  No field analysis → null (graceful)');
  });

  test('returns null when empty field analysis', async () => {
    const result = await analyzeFields({}, 'sk-fake-key');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  test('BATCH_SIZE is a reasonable positive number', () => {
    expect(BATCH_SIZE).toBeGreaterThan(0);
    expect(BATCH_SIZE).toBeLessThanOrEqual(10);
    console.log(`  BATCH_SIZE: ${BATCH_SIZE}`);
  });

  test('MODEL is a valid Claude model ID', () => {
    expect(typeof MODEL).toBe('string');
    expect(MODEL).toContain('claude');
    console.log(`  MODEL: ${MODEL}`);
  });
});
