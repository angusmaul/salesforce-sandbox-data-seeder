/**
 * Tests for the error-driven insert retry engine.
 * No Salesforce needed — insertFn is mocked per scenario.
 */

const { insertWithRetry, remediateRecord, uniquifyValue } = require('./insert-retry');

const FIELDS = new Map([
  ['Name', { name: 'Name', type: 'string', length: 80 }],
  ['Description', { name: 'Description', type: 'string', length: 10 }],
  ['Email', { name: 'Email', type: 'email', length: 80 }],
  ['Industry', { name: 'Industry', type: 'picklist', restrictedPicklist: true, picklistValues: [
    { value: 'Tech', active: true }, { value: 'Retail', active: true }
  ] }],
  ['Amount__c', { name: 'Amount__c', type: 'double', precision: 4, scale: 1 }],
  ['AccountId', { name: 'AccountId', type: 'reference', required: true, referenceTo: ['Account'] }],
  ['OptionalRef', { name: 'OptionalRef', type: 'reference', required: false, referenceTo: ['Account'] }],
  ['LastName', { name: 'LastName', type: 'string', length: 80 }]
]);

const ctx = () => ({
  fieldsByName: FIELDS,
  regenerateField: (meta) => (meta.type === 'string' ? `regen-${meta.name}` : 42),
  onLog: () => {}
});

const ok = (id) => ({ success: true, id });
const fail = (code, fields, message = 'boom') => ({ success: false, errors: [{ statusCode: code, message, fields }] });

describe('insertWithRetry', () => {
  test('all succeed first pass: no retries, aligned results', async () => {
    const insertFn = async (recs) => recs.map((_, i) => ok(`id${i}`));
    const { resultsArray, retrySummary } = await insertWithRetry(insertFn, 'Account', [{ Name: 'A' }, { Name: 'B' }], ctx());
    expect(resultsArray.map(r => r.success)).toEqual([true, true]);
    expect(retrySummary.attempts).toBe(1);
    expect(retrySummary.recoveredRecords).toBe(0);
  });

  test('STRING_TOO_LONG truncated and recovered on pass 2', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map(() => fail('STRING_TOO_LONG', ['Description']));
      return recs.map((r, i) => (r.Description.length <= 10 ? ok(`id${i}`) : fail('STRING_TOO_LONG', ['Description'])));
    };
    const { resultsArray, retrySummary } = await insertWithRetry(
      insertFn, 'Account', [{ Name: 'A', Description: 'way too long description' }], ctx());
    expect(resultsArray[0].success).toBe(true);
    expect(resultsArray[0].attempts).toBe(2);
    expect(resultsArray[0].retryHistory[0].action).toContain('truncated Description');
    expect(retrySummary.recoveredRecords).toBe(1);
    expect(retrySummary.remediations.STRING_TOO_LONG.count).toBe(1);
  });

  test('FIELD_INTEGRITY_EXCEPTION drops named field', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map(() => fail('FIELD_INTEGRITY_EXCEPTION', ['Industry']));
      return recs.map((r, i) => ('Industry' in r ? fail('FIELD_INTEGRITY_EXCEPTION', ['Industry']) : ok(`id${i}`)));
    };
    const { resultsArray } = await insertWithRetry(insertFn, 'Account', [{ Name: 'A', Industry: 'Bogus' }], ctx());
    expect(resultsArray[0].success).toBe(true);
    expect(resultsArray[0].retryHistory[0].action).toContain('dropped Industry');
  });

  test('REQUIRED_FIELD_MISSING filled via regenerateField; required lookup drops record', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map((r) =>
        r.__which === 'fillable' ? fail('REQUIRED_FIELD_MISSING', ['LastName']) : fail('REQUIRED_FIELD_MISSING', ['AccountId']));
      return recs.map((r, i) => ok(`id${i}`));
    };
    const records = [{ __which: 'fillable', Name: 'A' }, { __which: 'lookup', Name: 'B' }];
    const { resultsArray } = await insertWithRetry(insertFn, 'Contact', records, ctx());
    expect(resultsArray[0].success).toBe(true);
    expect(resultsArray[0].retryHistory[0].action).toContain('filled LastName');
    expect(resultsArray[1].success).toBe(false); // required lookup → terminal
    expect(resultsArray[1].attempts).toBe(1);
  });

  test('DUPLICATES_DETECTED without fields uniquifies identity fields', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map(() => fail('DUPLICATES_DETECTED', undefined, 'duplicate rule'));
      return recs.map((r, i) => ok(`id${i}`));
    };
    const { resultsArray } = await insertWithRetry(insertFn, 'Account', [{ Name: 'Acme' }], ctx());
    expect(resultsArray[0].success).toBe(true);
    expect(resultsArray[0].retryHistory[0].action).toContain('uniquified Name');
  });

  test('transient UNABLE_TO_LOCK_ROW resubmits unchanged once', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map(() => fail('UNABLE_TO_LOCK_ROW', undefined, 'row lock'));
      return recs.map((r, i) => ok(`id${i}`));
    };
    const { resultsArray } = await insertWithRetry(insertFn, 'Account', [{ Name: 'A' }], ctx());
    expect(resultsArray[0].success).toBe(true);
    expect(resultsArray[0].retryHistory[0].action).toContain('transient');
  });

  test('validation exception without constraints fails terminally', async () => {
    const insertFn = async (recs) => recs.map(() => fail('FIELD_CUSTOM_VALIDATION_EXCEPTION', [], 'Amount must be < 500'));
    const { resultsArray, retrySummary } = await insertWithRetry(insertFn, 'Opportunity', [{ Name: 'A' }], ctx());
    expect(resultsArray[0].success).toBe(false);
    expect(resultsArray[0].errors[0].statusCode).toBe('FIELD_CUSTOM_VALIDATION_EXCEPTION');
    expect(retrySummary.attempts).toBe(1);
  });

  test('validation exception WITH interpreted constraints recovers (the "Active must be Yes" case)', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map(() => fail('FIELD_CUSTOM_VALIDATION_EXCEPTION', [], 'Active is required to be Yes'));
      return recs.map((r, i) => (r.Active__c === 'Yes' ? ok(`id${i}`) : fail('FIELD_CUSTOM_VALIDATION_EXCEPTION', [], 'Active is required to be Yes')));
    };
    const withConstraints = { ...ctx(), validationConstraints: { Active__c: { type: 'fixedValue', value: 'Yes' } } };
    const { resultsArray, retrySummary } = await insertWithRetry(insertFn, 'Account', [{ Name: 'Acme', Active__c: 'No' }], withConstraints);
    expect(resultsArray[0].success).toBe(true);
    expect(resultsArray[0].attempts).toBe(2);
    expect(resultsArray[0].retryHistory[0].action).toContain('applied validation constraints');
    expect(retrySummary.recoveredRecords).toBe(1);
  });

  test('validation exception with already-satisfied constraints stays terminal', async () => {
    const insertFn = async (recs) => recs.map(() => fail('FIELD_CUSTOM_VALIDATION_EXCEPTION', [], 'some other rule'));
    const withConstraints = { ...ctx(), validationConstraints: { Active__c: { type: 'fixedValue', value: 'Yes' } } };
    const { resultsArray } = await insertWithRetry(insertFn, 'Account', [{ Name: 'Acme', Active__c: 'Yes' }], withConstraints);
    expect(resultsArray[0].success).toBe(false);
    expect(resultsArray[0].attempts).toBe(1);
  });

  test('exhausts MAX_ATTEMPTS then fails with history', async () => {
    const insertFn = async (recs) => recs.map(() => fail('STRING_TOO_LONG', ['Name']));
    const { resultsArray } = await insertWithRetry(insertFn, 'Account', [{ Name: 'A'.repeat(200) }], ctx());
    expect(resultsArray[0].success).toBe(false);
    expect(resultsArray[0].attempts).toBe(3);
    expect(resultsArray[0].retryHistory.length).toBe(2);
  });

  test('mixed batch keeps original index alignment', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map((r) => (r.Name === 'B' ? fail('FIELD_INTEGRITY_EXCEPTION', ['Industry']) : ok(`first-${r.Name}`)));
      return recs.map((r) => ok(`retry-${r.Name}`));
    };
    const records = [{ Name: 'A' }, { Name: 'B', Industry: 'X' }, { Name: 'C' }];
    const { resultsArray } = await insertWithRetry(insertFn, 'Account', records, ctx());
    expect(resultsArray[0].id).toBe('first-A');
    expect(resultsArray[1].id).toBe('retry-B');
    expect(resultsArray[1].attempts).toBe(2);
    expect(resultsArray[2].id).toBe('first-C');
  });

  test('whole-call failure marks all pending as BULK_ERROR', async () => {
    const insertFn = async () => { throw new Error('REQUEST_LIMIT_EXCEEDED'); };
    const { resultsArray } = await insertWithRetry(insertFn, 'Account', [{ Name: 'A' }, { Name: 'B' }], ctx());
    expect(resultsArray.every(r => r.success === false)).toBe(true);
    expect(resultsArray[0].errors[0].statusCode).toBe('BULK_ERROR');
  });

  test('learnedDropFields requires >=3 fixes covering >=80% of recoveries', async () => {
    let call = 0;
    const insertFn = async (recs) => {
      call++;
      if (call === 1) return recs.map(() => fail('FIELD_INTEGRITY_EXCEPTION', ['Industry']));
      return recs.map((r, i) => ok(`id${i}`));
    };
    const records = [1, 2, 3, 4].map(n => ({ Name: `R${n}`, Industry: 'Bogus' }));
    const { learnedDropFields, retrySummary } = await insertWithRetry(insertFn, 'Account', records, ctx());
    expect(retrySummary.recoveredRecords).toBe(4);
    expect(learnedDropFields).toEqual(['Industry']);
  });
});

describe('remediateRecord unit', () => {
  test('NUMBER_OUTSIDE_VALID_RANGE clamps first, drops second', () => {
    const r1 = remediateRecord('Account', { Amount__c: 9477.9 }, [{ statusCode: 'NUMBER_OUTSIDE_VALID_RANGE', fields: ['Amount__c'] }], ctx(), 1);
    expect(r1.record.Amount__c).toBe(999.9);
    const r2 = remediateRecord('Account', { Amount__c: 9477.9, Name: 'A' }, [{ statusCode: 'NUMBER_OUTSIDE_VALID_RANGE', fields: ['Amount__c'] }], ctx(), 2);
    expect('Amount__c' in r2.record).toBe(false);
  });

  test('optional bad lookup dropped; unknown code returns null', () => {
    const r = remediateRecord('Contact', { OptionalRef: '001xx', Name: 'A' }, [{ statusCode: 'INVALID_CROSS_REFERENCE_KEY', fields: ['OptionalRef'] }], ctx(), 1);
    expect('OptionalRef' in r.record).toBe(false);
    expect(remediateRecord('Contact', { Name: 'A' }, [{ statusCode: 'SOMETHING_ELSE', fields: [] }], ctx(), 1)).toBeNull();
  });

  test('uniquifyValue respects email shape and length', () => {
    const email = uniquifyValue('john.smith@example.com', FIELDS.get('Email'));
    expect(email).toMatch(/^john\.smith-[a-z0-9]{5}@example\.com$/);
    const name = uniquifyValue('X'.repeat(80), FIELDS.get('Name'));
    expect(name.length).toBeLessThanOrEqual(80);
  });
});
