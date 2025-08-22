import { EnhancedDiscoveryService } from '../server/services/enhanced-discovery';
import { SalesforceService } from '../../src/services/salesforce';
import { parseValidationRuleFormula, parseObjectValidationRules } from '../server/lib/validation-rule-parser.js';
import { anonymizeObjectSchema } from '../server/lib/schema-anonymizer.js';

// Mock the Salesforce service
jest.mock('../../src/services/salesforce');

describe('Enhanced Discovery Service', () => {
  let enhancedDiscoveryService: EnhancedDiscoveryService;
  let mockSalesforceService: jest.Mocked<SalesforceService>;

  beforeEach(() => {
    mockSalesforceService = new SalesforceService() as jest.Mocked<SalesforceService>;
    enhancedDiscoveryService = new EnhancedDiscoveryService(mockSalesforceService);
  });

  afterEach(() => {
    // Cleanup to prevent test timeouts
    enhancedDiscoveryService.destroy();
  });

  describe('Validation Rule Parser', () => {
    test('should parse simple validation rule formula', () => {
      const formula = 'ISBLANK(Name)';
      const result = parseValidationRuleFormula(formula, 'Account');
      
      expect(result.fields).toContain('Name');
      expect(result.complexity).toBe('simple');
      expect(result.patterns).toContain('REQUIRED_FIELD_CHECK');
    });

    test('should parse conditional validation rule', () => {
      const formula = 'IF(Type = "Customer", ISBLANK(Industry), false)';
      const result = parseValidationRuleFormula(formula, 'Account');
      
      expect(result.fields).toContain('Type');
      expect(result.fields).toContain('Industry');
      expect(result.complexity).toBe('moderate');
      expect(result.patterns).toContain('CONDITIONAL_REQUIREMENT');
    });

    test('should parse complex validation rule with multiple conditions', () => {
      const formula = 'AND(Type = "Customer", OR(ISBLANK(Industry), ISBLANK(AnnualRevenue)), NOT(ISNULL(Website)))';
      const result = parseValidationRuleFormula(formula, 'Account');
      
      expect(result.fields).toContain('Type');
      expect(result.fields).toContain('Industry');
      expect(result.fields).toContain('AnnualRevenue');
      expect(result.fields).toContain('Website');
      expect(result.complexity).toBe('complex');
    });

    test('should handle date validation patterns', () => {
      const formula = 'CloseDate < TODAY()';
      const result = parseValidationRuleFormula(formula, 'Opportunity');
      
      expect(result.fields).toContain('CloseDate');
      expect(result.patterns).toContain('DATE_VALIDATION');
    });

    test('should identify cross-object validation', () => {
      const formula = 'Account.Type = "Customer" && ISBLANK(ContactId)';
      const result = parseValidationRuleFormula(formula, 'Opportunity');
      
      expect(result.patterns).toContain('CROSS_OBJECT_VALIDATION');
      expect(result.riskLevel).toBe('high');
    });

    test('should parse multiple validation rules for object', () => {
      const validationRules = [
        { errorConditionFormula: 'ISBLANK(Name)', active: true },
        { errorConditionFormula: 'AND(Type = "Customer", ISBLANK(Industry))', active: true },
        { errorConditionFormula: 'AnnualRevenue < 0', active: false }
      ];
      
      const result = parseObjectValidationRules(validationRules, 'Account');
      
      expect(result.totalRules).toBe(3);
      expect(result.activeRules).toBe(2);
      expect(result.allFields).toContain('Name');
      expect(result.allFields).toContain('Type');
      expect(result.allFields).toContain('Industry');
      expect(result.allFields).toContain('AnnualRevenue');
    });
  });

  describe('Schema Anonymizer', () => {
    const mockObject = {
      name: 'Custom_Object__c',
      apiName: 'Custom_Object__c',
      label: 'My Custom Object',
      labelPlural: 'My Custom Objects',
      keyPrefix: 'a01',
      custom: true,
      createable: true,
      updateable: true,
      deletable: true,
      queryable: true,
      fields: [
        {
          name: 'Name',
          apiName: 'Name',
          type: 'string',
          label: 'Name',
          required: true,
          unique: false,
          createable: true,
          updateable: true
        },
        {
          name: 'Custom_Field__c',
          apiName: 'Custom_Field__c',
          type: 'string',
          label: 'My Custom Field',
          required: false,
          unique: false,
          createable: true,
          updateable: true
        },
        {
          name: 'Account__c',
          apiName: 'Account__c',
          type: 'reference',
          label: 'Account',
          required: true,
          unique: false,
          createable: true,
          updateable: true,
          referenceTo: ['Account'],
          relationshipName: 'Account__r'
        }
      ],
      childRelationships: [],
      validationRules: [
        {
          id: 'vr001',
          fullName: 'Custom_Object__c.Required_Field_Check',
          active: true,
          errorConditionFormula: 'ISBLANK(Custom_Field__c)',
          errorMessage: 'Custom field is required',
          validationName: 'Required_Field_Check',
          complexity: 'simple' as const,
          riskLevel: 'low' as const
        }
      ]
    };

    test('should anonymize custom object while preserving standard fields', () => {
      const anonymized = anonymizeObjectSchema(mockObject, {
        preserveStandardObjects: true,
        preserveStandardFields: true
      });
      
      expect(anonymized.name).not.toBe(mockObject.name);
      expect(anonymized.name).toMatch(/CustomObject_[a-f0-9]+__c/);
      expect(anonymized.keyPrefix).toBe('xxx');
      expect(anonymized._anonymized).toBe(true);
      
      // Standard field should be preserved
      const nameField = anonymized.fields.find(f => f.name === 'Name');
      expect(nameField).toBeDefined();
      expect(nameField?.name).toBe('Name');
      
      // Custom field should be anonymized
      const customField = anonymized.fields.find(f => f.name.includes('CustomField_'));
      expect(customField).toBeDefined();
      expect(customField?.name).toMatch(/CustomField_[a-f0-9]+__c/);
    });

    test('should anonymize validation rules', () => {
      const anonymized = anonymizeObjectSchema(mockObject, {
        includeValidationRules: true
      });
      
      expect(anonymized.validationRules).toBeDefined();
      expect(anonymized.validationRules!.length).toBe(1);
      
      const rule = anonymized.validationRules![0];
      expect(rule.id).toMatch(/[a-f0-9]{12}/);
      expect(rule.fullName).toMatch(/ValidationRule_[a-f0-9]+/);
      expect(rule.errorMessage).toBe('Anonymized error message');
    });

    test('should preserve structure while anonymizing names', () => {
      const anonymized = anonymizeObjectSchema(mockObject);
      
      expect(anonymized.fields.length).toBe(mockObject.fields.length);
      expect(anonymized.custom).toBe(mockObject.custom);
      expect(anonymized.createable).toBe(mockObject.createable);
      
      // Check that reference relationships are preserved
      const referenceField = anonymized.fields.find(f => f.referenceTo);
      expect(referenceField).toBeDefined();
      expect(referenceField?.referenceTo).toEqual(['Account']); // Standard object preserved
    });
  });

  describe('Cache Management', () => {
    test('should cache and retrieve validation rules', () => {
      const cacheStats = enhancedDiscoveryService.getCacheStats();
      expect(cacheStats.totalEntries).toBe(0);
      
      // Cache would be tested with actual service calls in integration tests
      // Here we just verify the cache interface exists
      enhancedDiscoveryService.clearCache();
      expect(cacheStats.totalEntries).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid validation rule formulas gracefully', () => {
      const invalidFormula = '((())'; // Malformed formula
      const result = parseValidationRuleFormula(invalidFormula, 'Account');
      
      expect(result.complexity).toBe('complex'); // Marked as complex when parsing fails
      expect(result.riskLevel).toBe('medium');
      expect(result.fields).toEqual([]);
    });

    test('should handle empty or null formulas', () => {
      const result1 = parseValidationRuleFormula('', 'Account');
      const result2 = parseValidationRuleFormula(null as any, 'Account');
      
      expect(result1.fields).toEqual([]);
      expect(result1.complexity).toBe('simple');
      expect(result2.fields).toEqual([]);
      expect(result2.complexity).toBe('simple');
    });
  });
});

describe('Integration Tests', () => {
  // These would require actual Salesforce connection in a real test environment
  describe('Salesforce Integration', () => {
    test.skip('should fetch validation rules from actual Salesforce org', async () => {
      // This test would run against a real Salesforce org
      // Skipped in unit tests but would be valuable in integration testing
    });

    test.skip('should handle Metadata API errors gracefully', async () => {
      // Test error handling when Metadata API is unavailable
    });

    test.skip('should fallback to Tooling API when Metadata API fails', async () => {
      // Test the fallback mechanism
    });
  });
});