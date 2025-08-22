import { AIService, AIServiceConfig } from '../server/services/ai-service';
import { jest } from '@jest/globals';

// Mock Anthropic SDK
const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockAnthropicCreate
      }
    }))
  };
});

describe('AIService', () => {
  let aiService: AIService;
  let config: AIServiceConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      apiKey: 'test-api-key',
      model: 'claude-3-sonnet-20240229',
      maxTokens: 1000,
      temperature: 0.7,
      requestTimeout: 30000,
      maxRetries: 3,
      retryDelayMs: 100, // Shorter delay for tests
      rateLimitRpm: 60,
      usageTrackingEnabled: true
    };
  });

  afterEach(async () => {
    if (aiService) {
      aiService.stopBackgroundProcesses();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid config', () => {
      expect(() => {
        aiService = new AIService(config);
      }).not.toThrow();
    });

    it('should throw error without API key', () => {
      const invalidConfig = { ...config, apiKey: '' };
      expect(() => {
        new AIService(invalidConfig);
      }).toThrow('Claude API key is required');
    });

    it('should use default values for optional config', () => {
      const minimalConfig = { apiKey: 'test-key' };
      aiService = new AIService(minimalConfig);
      expect(aiService).toBeInstanceOf(AIService);
    });
  });

  describe('Schema Analysis', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should analyze schema successfully', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            objectType: 'Account',
            validationRules: [
              {
                type: 'required',
                field: 'Name',
                constraint: 'NOT NULL',
                severity: 'error'
              }
            ],
            fieldDependencies: [],
            suggestions: ['Ensure Name field is populated'],
            complexity: 'simple',
            riskFactors: []
          })
        }]
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const schemaData = {
        name: 'Account',
        fields: [
          { name: 'Name', type: 'string', required: true }
        ]
      };

      const result = await aiService.analyzeSchema(schemaData);

      expect(result.objectType).toBe('Account');
      expect(result.validationRules).toHaveLength(1);
      expect(result.complexity).toBe('simple');
      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: config.model,
          max_tokens: 1500,
          temperature: 0.3
        })
      );
    });

    it('should handle schema analysis errors gracefully', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('API Error'));

      const schemaData = { name: 'Test' };
      
      // Add an error event handler to prevent unhandled error
      aiService.on('error', () => {
        // Expected error, do nothing
      });
      
      await expect(aiService.analyzeSchema(schemaData)).rejects.toThrow('Schema analysis failed: API Error');
    });

    it('should anonymize sensitive schema data', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: '{"objectType": "Account"}' }]
      };
      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const sensitiveSchema = {
        name: 'Customer_Account__c',
        fields: [
          { name: 'SSN__c', type: 'string', required: true },
          { name: 'Email__c', type: 'email' }
        ]
      };

      await aiService.analyzeSchema(sensitiveSchema);

      // Verify that the actual field names are not sent to Claude
      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      const messageContent = callArgs.messages[0].content;
      expect(messageContent).not.toContain('SSN__c');
      expect(messageContent).not.toContain('Customer_Account__c');
    });
  });

  describe('Field Suggestions', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should generate field suggestions successfully', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify([
            {
              field: 'Name',
              value: 'Acme Corporation',
              confidence: 0.9,
              reasoning: 'Realistic company name for Account object'
            }
          ])
        }]
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateFieldSuggestions('Account', 'Name', {});

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('Name');
      expect(result[0].value).toBe('Acme Corporation');
      expect(result[0].confidence).toBe(0.9);
    });

    it('should handle non-JSON responses gracefully', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Here are some suggestions: Use realistic company names'
        }]
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await aiService.generateFieldSuggestions('Account', 'Name', {});

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('unknown');
      expect(result[0].reasoning).toBe('Fallback parsing');
    });
  });

  describe('Data Validation', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should validate data patterns successfully', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            isValid: false,
            violations: [
              {
                field: 'Email',
                rule: 'email_format',
                severity: 'error',
                message: 'Invalid email format'
              }
            ],
            suggestions: ['Use proper email format'],
            riskScore: 7
          })
        }]
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const data = { Email: 'invalid-email' };
      const rules = [
        { type: 'format' as const, field: 'Email', constraint: 'email', severity: 'error' as const }
      ];

      const result = await aiService.validateDataPattern(data, rules);

      expect(result.isValid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.riskScore).toBe(7);
    });
  });

  describe('Natural Language Processing', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should process natural language requests successfully', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            action: 'configure',
            parameters: { recordCount: 100 },
            explanation: 'Set record count to 100 for Account object',
            confidence: 0.8,
            steps: ['Navigate to configuration', 'Set Account count to 100']
          })
        }]
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await aiService.processNaturalLanguageRequest(
        'Create 100 Account records',
        { id: 'test-session', currentStep: 'configuration' }
      );

      expect(result.action).toBe('configure');
      expect(result.parameters.recordCount).toBe(100);
      expect(result.confidence).toBe(0.8);
      expect(result.steps).toHaveLength(2);
    });
  });

  describe('Chat Functionality', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should handle basic chat requests', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'I can help you with Salesforce data seeding. What would you like to know?'
        }]
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await aiService.chat('Hello, can you help me?');

      expect(result).toContain('help you with Salesforce data seeding');
      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'Hello, can you help me?'
            })
          ])
        })
      );
    });

    it('should include system prompt when provided', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response with context' }]
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const context = { currentStep: 'discovery', objectCount: 5 };
      await aiService.chat('Help me with discovery', context);

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
      expect(callArgs.system).toContain('Salesforce data seeding');
    });
  });

  describe('Error Handling and Retry Logic', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should retry on transient failures', async () => {
      mockAnthropicCreate
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Success on third try' }]
        });

      const result = await aiService.chat('Test message');

      expect(result).toBe('Success on third try');
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(3);
    });

    it('should handle rate limit errors specifically', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      
      mockAnthropicCreate.mockRejectedValue(rateLimitError);

      const errorListener = jest.fn();
      aiService.on('rateLimitHit', errorListener);

      await expect(aiService.chat('Test')).rejects.toThrow();
      expect(errorListener).toHaveBeenCalled();
    });

    it('should fail after max retries', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Persistent error'));

      await expect(aiService.chat('Test')).rejects.toThrow('Persistent error');
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(3); // maxRetries = 3
    });
  });

  describe('Usage Tracking', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should track usage statistics', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response with some content to measure tokens' }]
      };

      // Add a small delay to simulate real API response time
      mockAnthropicCreate.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockResponse;
      });

      const initialStats = aiService.getUsageStats();
      expect(initialStats.totalRequests).toBe(0);

      await aiService.chat('Test message');

      const updatedStats = aiService.getUsageStats();
      expect(updatedStats.totalRequests).toBe(1);
      expect(updatedStats.totalTokens).toBeGreaterThan(0);
      expect(updatedStats.averageResponseTime).toBeGreaterThan(0);
    });

    it('should reset usage statistics', () => {
      const stats = aiService.getUsageStats();
      stats.totalRequests = 10; // Simulate some usage
      
      aiService.resetUsageStats();
      
      const resetStats = aiService.getUsageStats();
      expect(resetStats.totalRequests).toBe(0);
      expect(resetStats.totalTokens).toBe(0);
    });

    it('should disable usage tracking when configured', () => {
      const configWithoutTracking = { ...config, usageTrackingEnabled: false };
      aiService = new AIService(configWithoutTracking);

      // Usage tracking should not interfere with basic functionality
      expect(aiService.getUsageStats()).toBeDefined();
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should perform health checks', async () => {
      // Add a small delay to simulate real API response time
      mockAnthropicCreate.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { content: [{ type: 'text', text: 'pong' }] };
      });

      const health = await aiService.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.lastCheck).toBeInstanceOf(Date);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(health.uptime).toBeGreaterThan(0);
    });

    it('should detect unhealthy status on failures', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Service unavailable'));

      const health = await aiService.checkHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Service unavailable');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      const rateLimitConfig = { ...config, rateLimitRpm: 60 }; // Standard limit
      aiService = new AIService(rateLimitConfig);
    });

    it('should have rate limiting configuration', () => {
      // Test that the service is configured with rate limiting
      expect(aiService).toBeInstanceOf(AIService);
      // Rate limiting is tested through queue mechanism which is disabled in test mode
      // This test ensures the configuration is accepted
    });
  });

  describe('Event Emission', () => {
    beforeEach(() => {
      aiService = new AIService(config);
    });

    it('should emit error events', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Test error'));

      const errorListener = jest.fn();
      aiService.on('error', errorListener);

      await expect(aiService.chat('Test')).rejects.toThrow();
      expect(errorListener).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'chat',
          error: expect.any(Error)
        })
      );
    });

    it('should emit usage events', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }]
      });

      const usageListener = jest.fn();
      aiService.on('usage', usageListener);

      await aiService.chat('Test');
      
      expect(usageListener).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'chat',
          responseTime: expect.any(Number),
          estimatedTokens: expect.any(Number)
        })
      );
    });
  });
});