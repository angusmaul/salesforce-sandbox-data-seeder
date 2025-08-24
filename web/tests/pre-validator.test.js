const { PreValidator } = require('../server/services/pre-validator.ts');

describe('PreValidator', () => {
  let preValidator;
  
  const sampleValidationRules = [
    {
      fullName: 'Account_Name_Required',
      active: true,
      errorConditionFormula: 'ISBLANK(Name)',
      errorMessage: 'Account name is required',
      errorDisplayField: 'Name'
    },
    {
      fullName: 'Account_Website_Format',
      active: true,
      errorConditionFormula: 'AND(ISNOTBLANK(Website), NOT(BEGINS(Website, "http")))',
      errorMessage: 'Website must begin with http',
      errorDisplayField: 'Website'
    },
    {
      fullName: 'Account_Phone_Length',
      active: true,
      errorConditionFormula: 'AND(ISNOTBLANK(Phone), LEN(Phone) < 10)',
      errorMessage: 'Phone number must be at least 10 digits',
      errorDisplayField: 'Phone'
    },
    {
      fullName: 'Inactive_Rule',
      active: false,
      errorConditionFormula: 'ISBLANK(Name)',
      errorMessage: 'This rule is inactive',
      errorDisplayField: 'Name'
    },
    {
      fullName: 'Unsupported_Rule',
      active: true,
      errorConditionFormula: 'VLOOKUP(Name, "Table", 1, FALSE) = "Invalid"',
      errorMessage: 'This rule uses unsupported functions',
      errorDisplayField: 'Name'
    }
  ];

  const sampleFieldMetadata = {
    Name: { name: 'Name', type: 'string', required: true },
    Website: { name: 'Website', type: 'url' },
    Phone: { name: 'Phone', type: 'phone' },
    Industry: { name: 'Industry', type: 'picklist', picklistValues: ['Technology', 'Finance', 'Healthcare'] }
  };

  beforeEach(() => {
    preValidator = new PreValidator();
  });

  afterEach(() => {
    preValidator.clearCache();
  });

  describe('Basic Pre-validation', () => {
    test('should validate records with no violations', async () => {
      const records = [
        {
          Name: 'Test Company',
          Website: 'https://example.com',
          Phone: '555-123-4567'
        }
      ];

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata
      );

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.performance.recordsProcessed).toBe(1);
    });

    test('should detect validation violations', async () => {
      const records = [
        {
          Name: '', // Violates Name_Required rule
          Website: 'example.com', // Violates Website_Format rule
          Phone: '555' // Violates Phone_Length rule
        }
      ];

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata
      );

      expect(result.isValid).toBe(false);
      expect(result.violations).toHaveLength(3);
      
      const violationRules = result.violations.map(v => v.ruleId);
      expect(violationRules).toContain('Account_Name_Required');
      expect(violationRules).toContain('Account_Website_Format');
      expect(violationRules).toContain('Account_Phone_Length');
    });

    test('should skip inactive rules', async () => {
      const records = [
        { Name: '' } // Would violate both active and inactive rules
      ];

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata
      );

      // Should only have violation from active rule
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].ruleId).toBe('Account_Name_Required');
    });

    test('should handle unsupported rules with warnings', async () => {
      const records = [
        { Name: 'Test Company' }
      ];

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata,
        { includeWarnings: true }
      );

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('unsupported_formula');
    });
  });

  describe('Suggestion Generation', () => {
    test('should generate suggestions for blank field violations', async () => {
      const records = [
        { Name: '', Phone: '' }
      ];

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata,
        { includeSuggestions: true }
      );

      expect(result.suggestions.length).toBeGreaterThan(0);
      
      const nameSuggestion = result.suggestions.find(s => s.field === 'Name');
      expect(nameSuggestion).toBeDefined();
      expect(nameSuggestion.suggestedValue).toBeTruthy();
    });

    test('should generate suggestions for phone length violations', async () => {
      const records = [
        { Name: 'Test', Phone: '555' }
      ];

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata,
        { includeSuggestions: true }
      );

      const phoneSuggestion = result.suggestions.find(s => s.field === 'Phone');
      expect(phoneSuggestion).toBeDefined();
      expect(phoneSuggestion.suggestedValue.length).toBeGreaterThan(10);
    });

    test('should apply suggestions to fix records', async () => {
      const record = { Name: '', Phone: '555' };
      const suggestions = [
        {
          field: 'Name',
          currentValue: '',
          suggestedValue: 'Sample Name',
          reason: 'Field is required',
          confidence: 0.9
        },
        {
          field: 'Phone',
          currentValue: '555',
          suggestedValue: '5551234567',
          reason: 'Phone too short',
          confidence: 0.8
        }
      ];

      const fixedRecord = await preValidator.applySuggestions(record, suggestions, 0.7);

      expect(fixedRecord.Name).toBe('Sample Name');
      expect(fixedRecord.Phone).toBe('5551234567');
    });
  });

  describe('Performance Optimization', () => {
    test('should use caching for repeated evaluations', async () => {
      const records = Array(100).fill({
        Name: 'Test Company',
        Website: 'https://example.com',
        Phone: '555-123-4567'
      });

      // First run
      const start1 = Date.now();
      await preValidator.preValidateRecords(records, sampleValidationRules, sampleFieldMetadata);
      const duration1 = Date.now() - start1;

      // Second run should be faster due to caching
      const start2 = Date.now();
      await preValidator.preValidateRecords(records, sampleValidationRules, sampleFieldMetadata);
      const duration2 = Date.now() - start2;

      expect(duration2).toBeLessThan(duration1);

      const metrics = preValidator.getPerformanceMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
    });

    test('should handle large datasets efficiently', async () => {
      const records = Array(1000).fill().map((_, i) => ({
        Name: `Company ${i}`,
        Website: 'https://example.com',
        Phone: '555-123-4567'
      }));

      const start = Date.now();
      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata,
        { optimizeForPerformance: true }
      );
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10000); // Should complete in less than 10 seconds
      expect(result.performance.recordsProcessed).toBe(1000);
    });

    test('should use optimized validation for very large datasets', async () => {
      const records = Array(2000).fill().map((_, i) => ({
        Name: `Company ${i}`,
        Website: 'https://example.com',
        Phone: '555-123-4567'
      }));

      const result = await preValidator.preValidateLargeDataset(
        records,
        sampleValidationRules,
        sampleFieldMetadata,
        { timeoutMs: 10000 }
      );

      expect(result.performance.recordsProcessed).toBeLessThan(records.length); // Should use sampling
      expect(result.warnings.some(w => w.type === 'performance')).toBe(true);
    });

    test('should timeout gracefully on slow validation', async () => {
      const records = Array(100).fill({
        Name: 'Test Company'
      });

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata,
        { timeoutMs: 1 } // Very short timeout
      );

      const hasTimeoutWarning = result.warnings.some(w => 
        w.type === 'performance' && w.message.includes('timeout')
      );
      expect(hasTimeoutWarning).toBe(true);
    });
  });

  describe('Validation Coverage', () => {
    test('should calculate validation coverage correctly', async () => {
      const coverage = await preValidator.getValidationCoverage(sampleValidationRules);

      expect(coverage.total).toBe(5); // All rules
      expect(coverage.supported).toBe(3); // Excluding inactive and unsupported
      expect(coverage.unsupported).toBe(1); // VLOOKUP rule
      expect(coverage.coverage).toBeCloseTo(60, 1); // 3/5 * 100
      
      expect(coverage.unsupportedReasons).toHaveProperty('lookup_functions');
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple batches efficiently', async () => {
      const batch1 = Array(10).fill({ Name: 'Company A' });
      const batch2 = Array(10).fill({ Name: 'Company B' });
      const batch3 = Array(10).fill({ Name: '' }); // This batch has violations

      const results = await preValidator.batchPreValidate(
        [batch1, batch2, batch3],
        sampleValidationRules,
        sampleFieldMetadata
      );

      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
      expect(results[2].isValid).toBe(false);
      expect(results[2].violations).toHaveLength(10); // One violation per record
    });
  });

  describe('Generation Pattern Validation', () => {
    test('should validate generation patterns', async () => {
      const generationPattern = {
        fields: {
          Name: { type: 'string', required: true },
          Website: { type: 'url' },
          Phone: { type: 'phone' }
        }
      };

      const result = await preValidator.validateGenerationPattern(
        'Account',
        generationPattern,
        sampleValidationRules,
        sampleFieldMetadata
      );

      expect(result.canGenerate).toBe(true);
      expect(result.riskScore).toBeLessThan(50);
      expect(result.issues).toHaveLength(0);
    });

    test('should identify risky generation patterns', async () => {
      const riskyPattern = {
        fields: {
          Name: { type: 'string', required: false }, // Risk: required field not marked as required
          Website: { type: 'string' }, // Risk: might not follow URL format
          Phone: { type: 'string' } // Risk: might be too short
        }
      };

      const result = await preValidator.validateGenerationPattern(
        'Account',
        riskyPattern,
        sampleValidationRules,
        sampleFieldMetadata
      );

      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed validation rules gracefully', async () => {
      const malformedRules = [
        {
          fullName: 'Bad_Rule',
          active: true,
          errorConditionFormula: 'INVALID_SYNTAX(',
          errorMessage: 'Malformed rule',
          errorDisplayField: 'Name'
        }
      ];

      const records = [{ Name: 'Test' }];

      const result = await preValidator.preValidateRecords(
        records,
        malformedRules,
        sampleFieldMetadata
      );

      // Should not crash, should continue processing
      expect(result).toBeDefined();
      expect(result.performance.recordsProcessed).toBe(1);
    });

    test('should handle missing field metadata', async () => {
      const records = [{ UnknownField: 'value' }];

      const result = await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        {} // Empty metadata
      );

      expect(result).toBeDefined();
      expect(result.performance.recordsProcessed).toBe(1);
    });
  });

  describe('Memory Management', () => {
    test('should clear cache when requested', () => {
      // Add some cache entries
      preValidator.cache.set('test1', { violates: true });
      preValidator.cache.set('test2', { violates: false });

      expect(preValidator.cache.size).toBe(2);

      preValidator.clearCache();

      expect(preValidator.cache.size).toBe(0);
    });

    test('should limit cache size to prevent memory leaks', async () => {
      // Create many unique records to fill cache
      const records = Array(15000).fill().map((_, i) => ({
        Name: `Unique Company ${i}`,
        Website: `https://company${i}.com`,
        Phone: `555-${i.toString().padStart(7, '0')}`
      }));

      await preValidator.preValidateRecords(
        records,
        sampleValidationRules,
        sampleFieldMetadata
      );

      const metrics = preValidator.getPerformanceMetrics();
      expect(metrics.cacheSize).toBeLessThanOrEqual(10000); // Cache size limit
    });
  });

  describe('Integration Tests', () => {
    test('should handle real-world Salesforce validation scenarios', async () => {
      const realWorldRules = [
        {
          fullName: 'Opportunity_Amount_Required',
          active: true,
          errorConditionFormula: 'AND(ISPICKVAL(StageName, "Closed Won"), OR(ISNULL(Amount), Amount <= 0))',
          errorMessage: 'Amount is required for closed won opportunities',
          errorDisplayField: 'Amount'
        },
        {
          fullName: 'Contact_Email_Format',
          active: true,
          errorConditionFormula: 'AND(ISNOTBLANK(Email), NOT(CONTAINS(Email, "@")))',
          errorMessage: 'Invalid email format',
          errorDisplayField: 'Email'
        }
      ];

      const realWorldMetadata = {
        StageName: { name: 'StageName', type: 'picklist', picklistValues: ['Prospecting', 'Closed Won', 'Closed Lost'] },
        Amount: { name: 'Amount', type: 'currency' },
        Email: { name: 'Email', type: 'email' }
      };

      const validRecords = [
        { StageName: 'Closed Won', Amount: 1000, Email: 'test@example.com' },
        { StageName: 'Prospecting', Amount: null, Email: '' }
      ];

      const invalidRecords = [
        { StageName: 'Closed Won', Amount: 0, Email: 'invalid-email' },
        { StageName: 'Closed Won', Amount: null, Email: 'no-at-sign' }
      ];

      const validResult = await preValidator.preValidateRecords(
        validRecords,
        realWorldRules,
        realWorldMetadata
      );

      const invalidResult = await preValidator.preValidateRecords(
        invalidRecords,
        realWorldRules,
        realWorldMetadata
      );

      expect(validResult.isValid).toBe(true);
      expect(validResult.violations).toHaveLength(0);

      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.violations.length).toBeGreaterThan(0);
    });
  });
});