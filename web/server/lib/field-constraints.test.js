/**
 * Tests for validation-rule constraint application.
 */

const { applyConstraints } = require('./field-constraints');

const FIELDS = new Map([
  ['Active__c', { name: 'Active__c', type: 'picklist', picklistValues: [{ value: 'Yes', active: true }, { value: 'No', active: true }] }],
  ['Amount', { name: 'Amount', type: 'currency', precision: 10, scale: 2 }],
  ['Name', { name: 'Name', type: 'string', length: 80 }],
  ['ReadOnly__c', { name: 'ReadOnly__c', type: 'string', createable: false }],
  ['Formula__c', { name: 'Formula__c', type: 'string', calculated: true }]
]);

const ctx = (extra = {}) => ({
  fieldsByName: FIELDS,
  regenerateField: (meta) => `gen-${meta.name}`,
  index: 0,
  ...extra
});

describe('applyConstraints', () => {
  test('fixedValue sets the value (the "Active must be Yes" case)', () => {
    const record = { Name: 'Acme', Active__c: 'No' };
    const notes = applyConstraints(record, { Active__c: { type: 'fixedValue', value: 'Yes' } }, ctx());
    expect(record.Active__c).toBe('Yes');
    expect(notes.length).toBe(1);
  });

  test('fixedValue is a no-op when already satisfied', () => {
    const record = { Active__c: 'Yes' };
    const notes = applyConstraints(record, { Active__c: { type: 'fixedValue', value: 'Yes' } }, ctx());
    expect(notes.length).toBe(0);
  });

  test('picklistSubset replaces out-of-subset values and fills missing', () => {
    const record = { Active__c: 'No' };
    applyConstraints(record, { Active__c: { type: 'picklistSubset', values: ['Yes'] } }, ctx());
    expect(record.Active__c).toBe('Yes');

    const empty = {};
    applyConstraints(empty, { Active__c: { type: 'picklistSubset', values: ['Yes'] } }, ctx());
    expect(empty.Active__c).toBe('Yes');
  });

  test('range clamps numbers and fills missing with min', () => {
    const record = { Amount: 900 };
    applyConstraints(record, { Amount: { type: 'range', max: 499 } }, ctx());
    expect(record.Amount).toBe(499);

    const missing = {};
    applyConstraints(missing, { Amount: { type: 'range', min: 10, max: 499 } }, ctx());
    expect(missing.Amount).toBe(10);
  });

  test('notNull fills via regenerateField; maxLength truncates', () => {
    const record = { Name: 'X'.repeat(100) };
    const notes = applyConstraints(record, {
      Active__c: { type: 'notNull' },
      Name: { type: 'maxLength', value: 20 }
    }, ctx());
    expect(record.Active__c).toBe('gen-Active__c');
    expect(record.Name.length).toBe(20);
    expect(notes.length).toBe(2);
  });

  test('never writes non-createable or formula fields', () => {
    const record = {};
    const notes = applyConstraints(record, {
      ReadOnly__c: { type: 'fixedValue', value: 'x' },
      Formula__c: { type: 'fixedValue', value: 'y' }
    }, ctx());
    expect(record).toEqual({});
    expect(notes.length).toBe(0);
  });

  test('handles null/empty constraint sets', () => {
    const record = { Name: 'A' };
    expect(applyConstraints(record, null, ctx())).toEqual([]);
    expect(applyConstraints(record, {}, ctx())).toEqual([]);
  });
});
