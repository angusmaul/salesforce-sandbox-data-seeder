import { ValidationEngine } from '../server/services/validation-engine';
import { AIService } from '../server/services/ai-service';
import { EnhancedDiscoveryService } from '../server/services/enhanced-discovery';
import { ConstraintSolver } from '../server/lib/constraint-solver';

// Mock services for testing
const mockSalesforceService = {
  getConnection: () => ({
    metadata: {
      list: jest.fn().mockResolvedValue([]),
      read: jest.fn().mockResolvedValue([]),
    },
    tooling: {
      query: jest.fn().mockResolvedValue({ records: [] })
    }
  })
};

const mockAIService = {
  analyzeSchema: jest.fn().mockResolvedValue({
    objectType: 'Test_Object__c',
    validationRules: [],
    fieldDependencies: [],
    suggestions: ['Test suggestion'],
    complexity: 'simple',
    riskFactors: []
  }),
  validateDataPattern: jest.fn().mockResolvedValue({
    isValid: true,
    violations: [],
    suggestions: [],
    riskScore: 2
  }),
  generateFieldSuggestions: jest.fn().mockResolvedValue([]),
  processNaturalLanguageRequest: jest.fn().mockResolvedValue({
    action: 'explain',
    parameters: {},
    explanation: 'Test explanation',
    confidence: 0.8,
    steps: []
  }),
  chat: jest.fn().mockResolvedValue('Test response'),
  getUsageStats: jest.fn().mockReturnValue({
    totalRequests: 0,
    totalTokens: 0,
    successRate: 0,
    averageResponseTime: 0,
    costEstimate: 0,
    lastReset: new Date(),
    rateLimitHits: 0
  }),
  getHealthStatus: jest.fn().mockReturnValue({
    status: 'healthy',
    lastCheck: new Date(),
    uptime: 1000
  }),
  stopBackgroundProcesses: jest.fn(),
  checkHealth: jest.fn().mockResolvedValue({
    status: 'healthy',
    lastCheck: new Date(),
    uptime: 1000
  })
};

describe('ValidationEngine', () => {
  let validationEngine: ValidationEngine;
  let enhancedDiscovery: EnhancedDiscoveryService;

  beforeEach(() => {
    enhancedDiscovery = new EnhancedDiscoveryService(mockSalesforceService as any);
    
    validationEngine = new ValidationEngine({
      aiService: mockAIService as any,
      enhancedDiscovery,
      enableAIAnalysis: true,
      cacheValidationResults: true,
      maxConcurrentValidations: 5,
      useLocalValidationFirst: true
    });
  });

  afterEach(() => {
    validationEngine.destroy();
    enhancedDiscovery.destroy();
  });

  describe('validateData', () => {
    it('should validate simple records successfully', async () => {
      const mockObject = {
        name: 'Account',
        apiName: 'Account',
        label: 'Account',
        labelPlural: 'Accounts',
        custom: false,
        createable: true,
        updateable: true,
        deletable: true,
        queryable: true,
        fields: [
          {
            name: 'Name',
            apiName: 'Name',
            type: 'string',
            label: 'Account Name',
            required: true,
            unique: false,
            createable: true,
            updateable: true
          }
        ],
        childRelationships: [],
        validationRules: [],
        schemaAnalysis: {
          objectName: 'Account',
          validationRules: [],
          fieldConstraints: [
            {
              field: 'Name',
              type: 'required',
              constraint: 'NOT_NULL',
              severity: 'error'
            }
          ],
          fieldDependencies: [],
          requiredFieldPatterns: ['Name is required'],
          complexityScore: 1,
          riskFactors: [],
          recommendations: [],
          anonymized: false,
          analysisTimestamp: new Date()
        }
      };

      // Mock the enhanced discovery to return our test object
      jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

      const request = {
        objectName: 'Account',
        data: [
          { Name: 'Test Account 1' },
          { Name: 'Test Account 2' },
          { Name: '' } // This should fail validation
        ],
        skipAIAnalysis: true,
        includeWarnings: true,
        validationLevel: 'standard' as const
      };

      const result = await validationEngine.validateData(request);

      expect(result).toBeDefined();
      expect(result.totalRecords).toBe(3);
      expect(result.validRecords).toBe(2);
      expect(result.invalidRecords).toBe(1);
      expect(result.isValid).toBe(false);
      expect(result.results).toHaveLength(3);
      
      // Check that the empty name record failed validation
      const failedRecord = result.results.find(r => !r.isValid);
      expect(failedRecord).toBeDefined();
      expect(failedRecord?.violations).toHaveLength(1);
      expect(failedRecord?.violations[0].field).toBe('Name');
    });

    it('should handle complex validation rules', async () => {
      const mockObject = {
        name: 'Opportunity',
        apiName: 'Opportunity',
        label: 'Opportunity',
        labelPlural: 'Opportunities',
        custom: false,
        createable: true,
        updateable: true,
        deletable: true,
        queryable: true,
        fields: [
          {
            name: 'Name',
            apiName: 'Name',
            type: 'string',
            label: 'Opportunity Name',
            required: true,
            unique: false,
            createable: true,
            updateable: true
          },
          {
            name: 'CloseDate',
            apiName: 'CloseDate',
            type: 'date',
            label: 'Close Date',
            required: true,
            unique: false,
            createable: true,
            updateable: true
          },
          {
            name: 'StageName',
            apiName: 'StageName',
            type: 'picklist',
            label: 'Stage',
            required: true,
            unique: false,
            createable: true,
            updateable: true
          }
        ],
        childRelationships: [],
        validationRules: [
          {
            id: 'test_rule_1',
            fullName: 'Opportunity.Test_Rule',
            active: true,
            description: 'Test validation rule',
            errorConditionFormula: 'ISBLANK(Name)',
            errorMessage: 'Name is required',
            errorDisplayField: 'Name',
            validationName: 'Test_Rule',
            fields: ['Name'],
            dependencies: [],
            complexity: 'simple' as const,
            riskLevel: 'low' as const
          }
        ]
      };

      jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

      const request = {
        objectName: 'Opportunity',
        data: [
          { 
            Name: 'Test Opportunity',
            CloseDate: '2024-12-31',
            StageName: 'Prospecting'
          }
        ],
        skipAIAnalysis: true,
        includeWarnings: false,
        validationLevel: 'comprehensive' as const
      };

      const result = await validationEngine.validateData(request);

      expect(result.totalRecords).toBe(1);
      expect(result.validRecords).toBe(1);
      expect(result.invalidRecords).toBe(0);
      expect(result.isValid).toBe(true);
    });

    it('should provide helpful suggestions for fixing violations', async () => {
      const mockObject = {
        name: 'Contact',
        fields: [
          {
            name: 'LastName',
            type: 'string',
            required: true,
            createable: true
          },
          {
            name: 'Email',
            type: 'email',
            required: false,
            createable: true
          }
        ],
        validationRules: [],
        schemaAnalysis: {
          fieldConstraints: [
            {
              field: 'LastName',
              type: 'required',
              constraint: 'NOT_NULL',
              severity: 'error'
            }
          ],
          fieldDependencies: []
        }
      };

      jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

      const request = {
        objectName: 'Contact',
        data: [
          { 
            LastName: '',  // Empty required field
            Email: 'invalid-email'  // Invalid email format
          }
        ],
        skipAIAnalysis: true,
        includeWarnings: true,
        validationLevel: 'standard' as const
      };

      const result = await validationEngine.validateData(request);

      expect(result.invalidRecords).toBe(1);
      const recordResult = result.results[0];
      expect(recordResult.violations).toHaveLength(1);
      expect(recordResult.suggestedFixes).toHaveLength(1);
      
      const suggestion = recordResult.suggestedFixes[0];
      expect(suggestion.field).toBe('LastName');
      expect(suggestion.reason).toContain('required');
    });
  });

  describe('preValidateGenerationPattern', () => {
    it('should validate generation patterns before creating records', async () => {
      const mockObject = {
        name: 'Account',
        fields: [
          {
            name: 'Name',
            type: 'string',
            required: true
          }
        ],
        validationRules: []
      };

      jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

      const result = await validationEngine.preValidateGenerationPattern(
        'Account',
        { Name: 'Test Account' }
      );

      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('analyzeValidationRules', () => {
    it('should analyze validation rules and provide insights', async () => {
      const mockObject = {
        name: 'Custom_Object__c',
        validationRules: [
          {
            id: 'rule1',
            errorConditionFormula: 'ISBLANK(Required_Field__c)',
            errorMessage: 'Required field is missing',
            complexity: 'simple',
            riskLevel: 'low'
          }
        ],
        schemaAnalysis: {
          fieldConstraints: [],
          fieldDependencies: []
        }
      };

      jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

      const result = await validationEngine.analyzeValidationRules('Custom_Object__c');

      expect(result).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.fieldRecommendations).toBeDefined();
      expect(result.riskAssessment).toBeDefined();
    });
  });

  describe('performance and caching', () => {
    it('should track performance metrics', async () => {
      const mockObject = {
        name: 'Account',
        fields: [],
        validationRules: [],
        schemaAnalysis: { fieldConstraints: [], fieldDependencies: [] }
      };

      jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

      const request = {
        objectName: 'Account',
        data: [{ Name: 'Test' }],
        skipAIAnalysis: true,
        validationLevel: 'basic' as const
      };

      const result = await validationEngine.validateData(request);

      expect(result.enginePerformance).toBeDefined();
      expect(result.enginePerformance.totalTimeMs).toBeGreaterThan(0);
      expect(result.enginePerformance.localValidationTimeMs).toBeGreaterThan(0);
      expect(result.enginePerformance.rulesEvaluated).toBeGreaterThanOrEqual(0);

      const metrics = validationEngine.getPerformanceMetrics();
      expect(metrics.totalValidations).toBe(1);
    });

    it('should cache validation contexts for better performance', async () => {
      const mockObject = {
        name: 'Account',
        fields: [],
        validationRules: [],
        schemaAnalysis: { fieldConstraints: [], fieldDependencies: [] }
      };

      const spy = jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

      const request = {
        objectName: 'Account',
        data: [{ Name: 'Test' }],
        skipAIAnalysis: true,
        validationLevel: 'basic' as const
      };

      // First call
      await validationEngine.validateData(request);
      
      // Second call should use cache
      await validationEngine.validateData(request);

      // Enhanced discovery should only be called once due to caching
      expect(spy).toHaveBeenCalledTimes(2); // Called once per validation due to session services
    });
  });
});

describe('ConstraintSolver', () => {
  let constraintSolver: ConstraintSolver;

  beforeEach(() => {
    constraintSolver = new ConstraintSolver({
      maxAttempts: 5,
      seedValue: 12345,
      useRealisticData: true
    });
  });

  describe('generateCompliantRecord', () => {
    it('should generate records that satisfy basic constraints', async () => {
      const mockObjectSchema = {
        name: 'Account',
        fields: [
          {
            name: 'Name',
            type: 'string',
            required: true,
            createable: true,
            calculated: false,
            autoNumber: false,
            length: 255
          },
          {
            name: 'Website',
            type: 'url',
            required: false,
            createable: true,
            calculated: false,
            autoNumber: false
          }
        ]
      };

      const validationRules = [];
      const fieldConstraints = [
        {
          field: 'Name',
          type: 'required',
          constraint: 'NOT_NULL',
          severity: 'error'
        }
      ];
      const fieldDependencies = [];

      const record = await constraintSolver.generateCompliantRecord(
        mockObjectSchema,
        validationRules,
        fieldConstraints,
        fieldDependencies
      );

      expect(record).toBeDefined();
      expect(record.Name).toBeDefined();
      expect(record.Name).not.toBe('');
      expect(typeof record.Name).toBe('string');
    });

    it('should handle field dependencies correctly', async () => {
      const mockObjectSchema = {
        name: 'Lead',
        fields: [
          {
            name: 'LastName',
            type: 'string',
            required: true,
            createable: true
          },
          {
            name: 'Company',
            type: 'string',
            required: false,
            createable: true
          },
          {
            name: 'Email',
            type: 'email',
            required: false,
            createable: true
          }
        ]
      };

      const fieldDependencies = [
        {
          sourceField: 'LastName',
          targetField: 'Email',
          type: 'required_if',
          condition: 'LastName != null'
        }
      ];

      const record = await constraintSolver.generateCompliantRecord(
        mockObjectSchema,
        [],
        [],
        fieldDependencies
      );

      expect(record.LastName).toBeDefined();
      if (record.LastName) {
        expect(record.Email).toBeDefined();
      }
    });

    it('should generate realistic field values based on field types', async () => {
      const mockObjectSchema = {
        name: 'Contact',
        fields: [
          {
            name: 'FirstName',
            type: 'string',
            required: false,
            createable: true
          },
          {
            name: 'LastName',
            type: 'string',
            required: true,
            createable: true
          },
          {
            name: 'Email',
            type: 'email',
            required: false,
            createable: true
          },
          {
            name: 'Phone',
            type: 'phone',
            required: false,
            createable: true
          },
          {
            name: 'Birthdate',
            type: 'date',
            required: false,
            createable: true
          }
        ]
      };

      const record = await constraintSolver.generateCompliantRecord(
        mockObjectSchema,
        [],
        [],
        []
      );

      expect(record.LastName).toBeDefined();
      
      if (record.Email) {
        expect(record.Email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
      
      if (record.Phone) {
        expect(typeof record.Phone).toBe('string');
      }
      
      if (record.Birthdate) {
        expect(record.Birthdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('generateCompliantRecords', () => {
    it('should generate multiple compliant records', async () => {
      const mockObjectSchema = {
        name: 'Account',
        fields: [
          {
            name: 'Name',
            type: 'string',
            required: true,
            createable: true,
            calculated: false,
            autoNumber: false
          }
        ]
      };

      const records = await constraintSolver.generateCompliantRecords(
        3,
        mockObjectSchema,
        [],
        [
          {
            field: 'Name',
            type: 'required',
            constraint: 'NOT_NULL',
            severity: 'error'
          }
        ],
        []
      );

      expect(records).toHaveLength(3);
      records.forEach(record => {
        expect(record.Name).toBeDefined();
        expect(record.Name).not.toBe('');
      });
    });
  });
});

describe('Integration Tests', () => {
  it('should integrate validation engine with constraint solver for end-to-end compliance', async () => {
    const mockSalesforceService = {
      getConnection: () => ({
        metadata: { list: jest.fn().mockResolvedValue([]), read: jest.fn().mockResolvedValue([]) },
        tooling: { query: jest.fn().mockResolvedValue({ records: [] }) }
      })
    };

    const enhancedDiscovery = new EnhancedDiscoveryService(mockSalesforceService as any);
    const validationEngine = new ValidationEngine({
      aiService: null, // No AI service for this test
      enhancedDiscovery,
      enableAIAnalysis: false,
      cacheValidationResults: false
    });

    const constraintSolver = new ConstraintSolver({
      useRealisticData: true,
      maxAttempts: 5
    });

    const mockObject = {
      name: 'Account',
      fields: [
        {
          name: 'Name',
          type: 'string',
          required: true,
          createable: true,
          calculated: false,
          autoNumber: false
        }
      ],
      validationRules: [],
      schemaAnalysis: {
        fieldConstraints: [
          {
            field: 'Name',
            type: 'required',
            constraint: 'NOT_NULL',
            severity: 'error'
          }
        ],
        fieldDependencies: []
      }
    };

    jest.spyOn(enhancedDiscovery, 'getEnhancedObject').mockResolvedValue(mockObject as any);

    // Generate compliant records
    const records = await constraintSolver.generateCompliantRecords(
      5,
      mockObject,
      [],
      mockObject.schemaAnalysis.fieldConstraints,
      mockObject.schemaAnalysis.fieldDependencies
    );

    // Validate the generated records
    const validationResult = await validationEngine.validateData({
      objectName: 'Account',
      data: records,
      skipAIAnalysis: true,
      validationLevel: 'standard'
    });

    expect(validationResult.isValid).toBe(true);
    expect(validationResult.validRecords).toBe(5);
    expect(validationResult.invalidRecords).toBe(0);

    // Cleanup
    validationEngine.destroy();
    enhancedDiscovery.destroy();
  });
});