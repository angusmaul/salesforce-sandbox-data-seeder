import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { WizardSession } from '../../shared/types/api';

export interface AIServiceConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  requestTimeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  rateLimitRpm?: number;
  usageTrackingEnabled?: boolean;
}

export interface SchemaAnalysis {
  objectType: string;
  validationRules: ValidationRule[];
  fieldDependencies: FieldDependency[];
  suggestions: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  riskFactors: string[];
}

export interface ValidationRule {
  type: 'required' | 'unique' | 'format' | 'range' | 'custom';
  field: string;
  constraint: string;
  errorMessage?: string;
  severity: 'error' | 'warning';
}

export interface FieldDependency {
  sourceField: string;
  targetField: string;
  type: 'required_if' | 'conditional' | 'lookup' | 'formula';
  condition?: string;
}

export interface FieldSuggestion {
  field: string;
  value: any;
  confidence: number;
  reasoning: string;
  alternatives?: any[];
}

export interface ValidationResult {
  isValid: boolean;
  violations: ValidationViolation[];
  suggestions: string[];
  riskScore: number;
}

export interface ValidationViolation {
  field: string;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  suggestedFix?: string;
}

export interface ActionPlan {
  action: 'configure' | 'navigate' | 'generate' | 'validate' | 'explain';
  parameters: Record<string, any>;
  explanation: string;
  confidence: number;
  steps?: string[];
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  successRate: number;
  averageResponseTime: number;
  costEstimate: number;
  lastReset: Date;
  rateLimitHits: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  uptime: number;
}

/**
 * Comprehensive AI service for Claude API integration
 * Provides schema analysis, data generation suggestions, and natural language processing
 */
export class AIService extends EventEmitter {
  private anthropic: Anthropic;
  private config: Required<AIServiceConfig>;
  private usageStats: UsageStats;
  private healthStatus: HealthStatus;
  private requestQueue: Array<{ timestamp: number; resolve: Function; reject: Function }> = [];
  private isProcessingQueue = false;
  private startTime = Date.now();
  private backgroundIntervals: NodeJS.Timeout[] = [];

  constructor(config: AIServiceConfig) {
    super();
    
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-3-sonnet-20240229',
      maxTokens: config.maxTokens || 1000,
      temperature: config.temperature || 0.7,
      requestTimeout: config.requestTimeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 1000,
      rateLimitRpm: config.rateLimitRpm || 60,
      usageTrackingEnabled: config.usageTrackingEnabled ?? true
    };

    if (!this.config.apiKey) {
      throw new Error('Claude API key is required');
    }

    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.requestTimeout
    });

    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      successRate: 0,
      averageResponseTime: 0,
      costEstimate: 0,
      lastReset: new Date(),
      rateLimitHits: 0
    };

    this.healthStatus = {
      status: 'healthy',
      lastCheck: new Date(),
      uptime: 0
    };

    // Start background processes (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      this.startUsageTracking();
      this.startHealthChecks();
      this.startQueueProcessor();
    }
  }

  /**
   * Analyze Salesforce schema and extract validation rules and dependencies
   */
  async analyzeSchema(schemaData: any): Promise<SchemaAnalysis> {
    const startTime = Date.now();
    
    try {
      // Anonymize schema data before sending to Claude
      const anonymizedSchema = this.anonymizeSchemaData(schemaData);
      
      const prompt = this.buildSchemaAnalysisPrompt(anonymizedSchema);
      
      const response = await this.makeRequest(prompt, {
        maxTokens: 1500,
        temperature: 0.3 // Lower temperature for more consistent analysis
      });

      const analysis = this.parseSchemaAnalysis(response);
      
      this.logUsage('analyzeSchema', Date.now() - startTime, response);
      
      return analysis;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', { operation: 'analyzeSchema', error });
      throw new Error(`Schema analysis failed: ${errorMessage}`);
    }
  }

  /**
   * Generate field value suggestions based on context and validation rules
   */
  async generateFieldSuggestions(
    objectType: string, 
    fieldType: string, 
    context: any
  ): Promise<FieldSuggestion[]> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildFieldSuggestionPrompt(objectType, fieldType, context);
      
      const response = await this.makeRequest(prompt, {
        maxTokens: 800,
        temperature: 0.8 // Higher temperature for more creative suggestions
      });

      const suggestions = this.parseFieldSuggestions(response);
      
      this.logUsage('generateFieldSuggestions', Date.now() - startTime, response);
      
      return suggestions;
    } catch (error) {
      this.emit('error', { operation: 'generateFieldSuggestions', error });
      throw new Error(`Field suggestion generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate data patterns against Salesforce validation rules
   */
  async validateDataPattern(data: any, validationRules: ValidationRule[]): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildValidationPrompt(data, validationRules);
      
      const response = await this.makeRequest(prompt, {
        maxTokens: 1200,
        temperature: 0.2 // Very low temperature for consistent validation
      });

      const result = this.parseValidationResult(response);
      
      this.logUsage('validateDataPattern', Date.now() - startTime, response);
      
      return result;
    } catch (error) {
      this.emit('error', { operation: 'validateDataPattern', error });
      throw new Error(`Data validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process natural language requests and return action plans
   */
  async processNaturalLanguageRequest(
    userInput: string, 
    sessionContext: Partial<WizardSession>
  ): Promise<ActionPlan> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildNaturalLanguagePrompt(userInput, sessionContext);
      
      const response = await this.makeRequest(prompt, {
        maxTokens: 1000,
        temperature: 0.6
      });

      const actionPlan = this.parseActionPlan(response);
      
      this.logUsage('processNaturalLanguageRequest', Date.now() - startTime, response);
      
      return actionPlan;
    } catch (error) {
      this.emit('error', { operation: 'processNaturalLanguageRequest', error });
      throw new Error(`Natural language processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Basic chat functionality with context awareness
   */
  async chat(message: string, context?: any): Promise<string> {
    const startTime = Date.now();
    
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const response = await this.makeRequest(message, {
        systemPrompt,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      this.logUsage('chat', Date.now() - startTime, response);
      
      return response;
    } catch (error) {
      this.emit('error', { operation: 'chat', error });
      throw new Error(`Chat request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): UsageStats {
    return { ...this.usageStats };
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus {
    return { 
      ...this.healthStatus,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      successRate: 0,
      averageResponseTime: 0,
      costEstimate: 0,
      lastReset: new Date(),
      rateLimitHits: 0
    };
  }

  /**
   * Stop all background processes (useful for testing and shutdown)
   */
  stopBackgroundProcesses(): void {
    this.backgroundIntervals.forEach(interval => clearInterval(interval));
    this.backgroundIntervals = [];
    this.removeAllListeners();
  }

  /**
   * Check if the service is healthy
   */
  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      // Simple health check with minimal token usage
      await this.makeRequest('ping', {
        maxTokens: 10,
        temperature: 0
      });

      this.healthStatus = {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        uptime: Date.now() - this.startTime
      };
    } catch (error) {
      this.healthStatus = {
        status: 'unhealthy',
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        uptime: Date.now() - this.startTime
      };
    }

    return this.healthStatus;
  }

  // Private methods

  private async makeRequest(
    message: string, 
    options: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<string> {
    // In test mode, execute directly without queue
    if (process.env.NODE_ENV === 'test') {
      return this.executeRequest(message, options);
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        timestamp: Date.now(),
        resolve: async () => {
          try {
            const result = await this.executeRequest(message, options);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        reject
      });
    });
  }

  private async executeRequest(
    message: string,
    options: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const requestParams: any = {
          model: this.config.model,
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || this.config.temperature,
          messages: [{
            role: 'user',
            content: message
          }]
        };

        if (options.systemPrompt) {
          requestParams.system = options.systemPrompt;
        }

        const response = await this.anthropic.messages.create(requestParams);
        
        const responseText = response.content
          .filter(item => item.type === 'text')
          .map(item => (item as any).text)
          .join('\n');

        return responseText;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (this.isRateLimitError(error)) {
          this.usageStats.rateLimitHits++;
          this.emit('rateLimitHit', { attempt, error });
        }
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  private isRateLimitError(error: any): boolean {
    return error?.status === 429 || 
           error?.code === 'rate_limit_exceeded' ||
           (error?.message && error.message.includes('rate limit'));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private anonymizeSchemaData(schemaData: any): any {
    // Remove sensitive information from schema data
    const anonymized = JSON.parse(JSON.stringify(schemaData));
    
    // Replace actual object name with generic name
    if (anonymized.name) {
      anonymized.name = 'OBJECT_NAME';
    }
    
    // Remove actual field names, keep types and constraints
    if (anonymized.fields) {
      anonymized.fields = anonymized.fields.map((field: any, index: number) => ({
        name: `FIELD_${index + 1}`,
        type: field.type,
        required: field.required,
        unique: field.unique,
        length: field.length,
        precision: field.precision,
        scale: field.scale,
        picklistValues: field.picklistValues ? ['OPTION_1', 'OPTION_2'] : undefined,
        validationRules: field.validationRules
      }));
    }
    
    return anonymized;
  }

  private buildSchemaAnalysisPrompt(schemaData: any): string {
    return `Analyze this Salesforce object schema and provide insights:

Schema: ${JSON.stringify(schemaData, null, 2)}

Please analyze and return a JSON response with:
1. validationRules: Array of validation rules found
2. fieldDependencies: Array of field dependencies
3. suggestions: Array of data generation suggestions
4. complexity: 'simple', 'moderate', or 'complex'
5. riskFactors: Array of potential issues

Focus on identifying validation constraints that could cause data insertion failures.`;
  }

  private buildFieldSuggestionPrompt(objectType: string, fieldType: string, context: any): string {
    return `Generate realistic field value suggestions for a Salesforce ${objectType} object.

Field Type: ${fieldType}
Context: ${JSON.stringify(context, null, 2)}

Return a JSON array of suggestions with:
- value: The suggested value
- confidence: 0-1 confidence score
- reasoning: Why this value is appropriate
- alternatives: Array of alternative values

Make suggestions realistic and appropriate for business use.`;
  }

  private buildValidationPrompt(data: any, validationRules: ValidationRule[]): string {
    return `Validate this data against Salesforce validation rules:

Data: ${JSON.stringify(data, null, 2)}
Rules: ${JSON.stringify(validationRules, null, 2)}

Return JSON with:
- isValid: boolean
- violations: Array of validation violations
- suggestions: Array of fix suggestions
- riskScore: 0-10 risk assessment`;
  }

  private buildNaturalLanguagePrompt(userInput: string, sessionContext: any): string {
    return `Process this user request for Salesforce data seeding:

User Input: "${userInput}"
Session Context: ${JSON.stringify(sessionContext, null, 2)}

Return JSON with:
- action: 'configure'|'navigate'|'generate'|'validate'|'explain'
- parameters: Object with action parameters
- explanation: Human-readable explanation
- confidence: 0-1 confidence score
- steps: Array of specific steps to take`;
  }

  private buildSystemPrompt(context?: any): string {
    return `You are an AI assistant specializing in Salesforce data seeding and sandbox management. 
You help users generate realistic test data while avoiding validation errors and maintaining data integrity.

Key capabilities:
- Salesforce object and field analysis
- Validation rule interpretation
- Data generation recommendations
- Error diagnosis and resolution

${context ? `Current context: ${JSON.stringify(context, null, 2)}` : ''}

Provide accurate, actionable advice focused on successful data generation.`;
  }

  private parseSchemaAnalysis(response: string): SchemaAnalysis {
    try {
      const parsed = JSON.parse(response);
      return {
        objectType: parsed.objectType || 'Unknown',
        validationRules: parsed.validationRules || [],
        fieldDependencies: parsed.fieldDependencies || [],
        suggestions: parsed.suggestions || [],
        complexity: parsed.complexity || 'moderate',
        riskFactors: parsed.riskFactors || []
      };
    } catch (error) {
      // Fallback parsing for non-JSON responses
      return {
        objectType: 'Unknown',
        validationRules: [],
        fieldDependencies: [],
        suggestions: [response],
        complexity: 'moderate',
        riskFactors: []
      };
    }
  }

  private parseFieldSuggestions(response: string): FieldSuggestion[] {
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [{ field: 'unknown', value: response, confidence: 0.5, reasoning: 'Parsed from text' }];
    } catch (error) {
      return [{ field: 'unknown', value: response, confidence: 0.5, reasoning: 'Fallback parsing' }];
    }
  }

  private parseValidationResult(response: string): ValidationResult {
    try {
      const parsed = JSON.parse(response);
      return {
        isValid: parsed.isValid ?? false,
        violations: parsed.violations || [],
        suggestions: parsed.suggestions || [],
        riskScore: parsed.riskScore || 5
      };
    } catch (error) {
      return {
        isValid: false,
        violations: [],
        suggestions: [response],
        riskScore: 5
      };
    }
  }

  private parseActionPlan(response: string): ActionPlan {
    try {
      const parsed = JSON.parse(response);
      return {
        action: parsed.action || 'explain',
        parameters: parsed.parameters || {},
        explanation: parsed.explanation || response,
        confidence: parsed.confidence || 0.5,
        steps: parsed.steps || []
      };
    } catch (error) {
      return {
        action: 'explain',
        parameters: {},
        explanation: response,
        confidence: 0.5,
        steps: []
      };
    }
  }

  private logUsage(operation: string, responseTime: number, response: string): void {
    if (!this.config.usageTrackingEnabled) return;

    this.usageStats.totalRequests++;
    
    // Estimate token usage (rough approximation: 1 token ≈ 4 characters)
    const estimatedTokens = Math.ceil((response.length) / 4);
    this.usageStats.totalTokens += estimatedTokens;
    
    // Update average response time
    this.usageStats.averageResponseTime = 
      (this.usageStats.averageResponseTime * (this.usageStats.totalRequests - 1) + responseTime) / 
      this.usageStats.totalRequests;
    
    // Estimate cost (rough: $0.015 per 1K tokens)
    this.usageStats.costEstimate += (estimatedTokens / 1000) * 0.015;
    
    this.emit('usage', { operation, responseTime, estimatedTokens });
  }

  private startUsageTracking(): void {
    if (!this.config.usageTrackingEnabled) return;

    // Reset usage stats daily
    const interval = setInterval(() => {
      this.resetUsageStats();
      this.emit('usageReset');
    }, 24 * 60 * 60 * 1000);
    this.backgroundIntervals.push(interval);
  }

  private startHealthChecks(): void {
    // Health check every 5 minutes
    const interval = setInterval(async () => {
      await this.checkHealth();
      this.emit('healthCheck', this.healthStatus);
    }, 5 * 60 * 1000);
    this.backgroundIntervals.push(interval);
  }

  private startQueueProcessor(): void {
    const interval = setInterval(() => {
      this.processQueue();
    }, 1000); // Process queue every second
    this.backgroundIntervals.push(interval);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;

    this.isProcessingQueue = true;
    
    try {
      const rateLimitInterval = 60000 / this.config.rateLimitRpm; // ms between requests
      const now = Date.now();
      
      // Find requests that can be processed (respecting rate limits)
      const eligibleRequests = this.requestQueue.filter((req, index) => {
        const timeSinceLastRequest = index === 0 ? rateLimitInterval : now - this.requestQueue[index - 1].timestamp;
        return timeSinceLastRequest >= rateLimitInterval;
      });

      if (eligibleRequests.length > 0) {
        const request = eligibleRequests[0];
        const index = this.requestQueue.indexOf(request);
        
        this.requestQueue.splice(index, 1);
        
        try {
          await request.resolve();
        } catch (error) {
          request.reject(error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }
}