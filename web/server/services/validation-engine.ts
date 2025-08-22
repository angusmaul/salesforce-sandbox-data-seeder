import { AIService, ValidationResult, ValidationViolation } from './ai-service';
import { EnhancedDiscoveryService } from './enhanced-discovery';
import { SalesforceObject, ValidationRuleMetadata, FieldConstraint, FieldDependency } from '../../../src/models/salesforce';
import { parseValidationRuleFormula, parseObjectValidationRules } from '../lib/validation-rule-parser.js';

export interface ValidationEngineConfig {
  aiService: AIService;
  enhancedDiscovery: EnhancedDiscoveryService;
  enableAIAnalysis?: boolean;
  cacheValidationResults?: boolean;
  maxConcurrentValidations?: number;
  useLocalValidationFirst?: boolean;
}

export interface ValidationRequest {
  objectName: string;
  data: Record<string, any>[];
  skipAIAnalysis?: boolean;
  includeWarnings?: boolean;
  validationLevel?: 'basic' | 'standard' | 'comprehensive';
}

export interface ValidationEngineResult {
  isValid: boolean;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  results: RecordValidationResult[];
  overallRiskScore: number;
  enginePerformance: ValidationEnginePerformance;
  recommendations: string[];
}

export interface RecordValidationResult {
  recordIndex: number;
  isValid: boolean;
  violations: ValidationViolation[];
  warnings: ValidationWarning[];
  riskScore: number;
  suggestedFixes: FieldSuggestion[];
  aiAnalysisUsed: boolean;
}

export interface ValidationWarning {
  field: string;
  type: 'data_quality' | 'potential_issue' | 'recommendation';
  message: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export interface FieldSuggestion {
  field: string;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  confidence: number;
  aiGenerated: boolean;
}

export interface ValidationEnginePerformance {
  totalTimeMs: number;
  localValidationTimeMs: number;
  aiAnalysisTimeMs?: number;
  rulesEvaluated: number;
  cacheHits: number;
  cacheMisses: number;
}

interface CachedValidationResult {
  objectName: string;
  validationRules: ValidationRuleMetadata[];
  fieldConstraints: FieldConstraint[];
  fieldDependencies: FieldDependency[];
  timestamp: Date;
  ttl: number;
}

interface ValidationCache {
  [key: string]: CachedValidationResult;
}

/**
 * Validation Rule Engine and Compliance Analysis
 * 
 * This engine analyzes Salesforce validation rules and ensures generated data complies
 * with business logic constraints. It uses both local rule parsing and AI-powered 
 * analysis to provide comprehensive validation and suggestions.
 */
export class ValidationEngine {
  private cache: ValidationCache = {};
  private readonly DEFAULT_CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private cleanupInterval?: NodeJS.Timeout;
  private performanceMetrics = {
    totalValidations: 0,
    successfulValidations: 0,
    aiAnalysisUsed: 0,
    avgResponseTime: 0,
    cacheHitRate: 0
  };

  constructor(private config: ValidationEngineConfig) {
    // Start cache cleanup (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => this.cleanupCache(), 30 * 60 * 1000); // 30 minutes
    }
  }

  /**
   * Main validation method - validates data against Salesforce validation rules
   */
  async validateData(request: ValidationRequest): Promise<ValidationEngineResult> {
    const startTime = Date.now();
    console.log(`🔍 Starting validation for ${request.objectName} with ${request.data.length} records`);

    try {
      // Get validation rules and constraints for the object
      const validationContext = await this.getValidationContext(request.objectName);
      
      // Validate each record
      const recordResults: RecordValidationResult[] = [];
      let localValidationTime = 0;
      let aiAnalysisTime = 0;
      let rulesEvaluated = 0;

      for (let i = 0; i < request.data.length; i++) {
        const record = request.data[i];
        const recordStartTime = Date.now();

        // Local validation first
        const localResult = await this.validateRecordLocally(
          record, 
          validationContext,
          request.includeWarnings || false
        );
        
        localValidationTime += Date.now() - recordStartTime;
        rulesEvaluated += validationContext.validationRules.length;

        let finalResult = localResult;

        // AI analysis if needed and enabled
        if (this.shouldUseAIAnalysis(request, localResult)) {
          const aiStartTime = Date.now();
          
          try {
            const aiResult = await this.enhanceWithAIAnalysis(
              record, 
              localResult, 
              validationContext,
              request.objectName
            );
            finalResult = aiResult;
            aiAnalysisTime += Date.now() - aiStartTime;
          } catch (aiError) {
            console.warn(`AI analysis failed for record ${i}: ${aiError instanceof Error ? aiError.message : aiError}`);
            // Continue with local validation result
          }
        }

        recordResults.push({
          ...finalResult,
          recordIndex: i
        });
      }

      // Calculate overall results
      const validRecords = recordResults.filter(r => r.isValid).length;
      const invalidRecords = recordResults.length - validRecords;
      const overallRiskScore = this.calculateOverallRiskScore(recordResults);
      const recommendations = this.generateRecommendations(recordResults, validationContext);

      const totalTime = Date.now() - startTime;

      // Update performance metrics
      this.updatePerformanceMetrics(totalTime, recordResults.some(r => r.aiAnalysisUsed));

      const result: ValidationEngineResult = {
        isValid: invalidRecords === 0,
        totalRecords: request.data.length,
        validRecords,
        invalidRecords,
        results: recordResults,
        overallRiskScore,
        enginePerformance: {
          totalTimeMs: totalTime,
          localValidationTimeMs: localValidationTime,
          aiAnalysisTimeMs: aiAnalysisTime > 0 ? aiAnalysisTime : undefined,
          rulesEvaluated,
          cacheHits: this.getCacheHits(),
          cacheMisses: this.getCacheMisses()
        },
        recommendations
      };

      console.log(`✅ Validation completed: ${validRecords}/${request.data.length} valid records in ${totalTime}ms`);
      return result;

    } catch (error) {
      console.error(`❌ Validation failed for ${request.objectName}:`, error);
      throw new Error(`Validation engine failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pre-validate data generation patterns before creating records
   */
  async preValidateGenerationPattern(
    objectName: string, 
    generationConfig: Record<string, any>
  ): Promise<ValidationResult> {
    console.log(`🔎 Pre-validating generation pattern for ${objectName}`);

    try {
      const validationContext = await this.getValidationContext(objectName);
      
      // Create a sample record based on the generation config
      const sampleRecord = this.createSampleRecord(generationConfig);
      
      // Validate the sample locally first
      const localResult = await this.validateRecordLocally(sampleRecord, validationContext, true);
      
      // If there are issues, use AI to suggest improvements
      if (!localResult.isValid || localResult.warnings.length > 0) {
        if (this.config.enableAIAnalysis && this.config.aiService) {
          try {
            const aiValidation = await this.config.aiService.validateDataPattern(
              sampleRecord,
              validationContext.validationRules.map(rule => ({
                type: 'custom' as const,
                field: rule.fields?.[0] || 'unknown',
                constraint: rule.errorConditionFormula,
                errorMessage: rule.errorMessage,
                severity: 'error' as const
              }))
            );

            return aiValidation;
          } catch (aiError) {
            console.warn(`AI pre-validation failed: ${aiError instanceof Error ? aiError.message : aiError}`);
          }
        }
      }

      return {
        isValid: localResult.isValid,
        violations: localResult.violations,
        suggestions: localResult.suggestedFixes.map(fix => 
          `${fix.field}: ${fix.reason} (confidence: ${fix.confidence})`
        ),
        riskScore: localResult.riskScore
      };

    } catch (error) {
      console.error(`Pre-validation failed for ${objectName}:`, error);
      return {
        isValid: false,
        violations: [{
          field: 'unknown',
          rule: 'pre_validation',
          severity: 'error',
          message: `Pre-validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        suggestions: ['Review object configuration and validation rules'],
        riskScore: 10
      };
    }
  }

  /**
   * Analyze validation rules and provide insights for data generation
   */
  async analyzeValidationRules(objectName: string): Promise<{
    analysis: any;
    fieldRecommendations: Record<string, any>;
    riskAssessment: any;
  }> {
    console.log(`📊 Analyzing validation rules for ${objectName}`);

    try {
      const validationContext = await this.getValidationContext(objectName);
      
      // Local analysis
      const localAnalysis = this.analyzeRulesLocally(validationContext);
      
      // AI-enhanced analysis if available
      let aiAnalysis = null;
      if (this.config.enableAIAnalysis && this.config.aiService) {
        try {
          // Create anonymized schema for AI analysis
          const anonymizedSchema = this.anonymizeValidationRules(validationContext);
          aiAnalysis = await this.config.aiService.analyzeSchema(anonymizedSchema);
        } catch (aiError) {
          console.warn(`AI analysis failed: ${aiError instanceof Error ? aiError.message : aiError}`);
        }
      }

      return {
        analysis: {
          local: localAnalysis,
          ai: aiAnalysis,
          combined: this.combineAnalysis(localAnalysis, aiAnalysis)
        },
        fieldRecommendations: this.generateFieldRecommendations(validationContext, aiAnalysis),
        riskAssessment: this.assessValidationRisk(validationContext)
      };

    } catch (error) {
      console.error(`Rule analysis failed for ${objectName}:`, error);
      throw new Error(`Validation rule analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.cache = {};
    console.log('🗑️ Validation cache cleared');
  }

  /**
   * Stop background processes (for testing and cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clearCache();
  }

  // Private methods

  private async getValidationContext(objectName: string): Promise<{
    validationRules: ValidationRuleMetadata[];
    fieldConstraints: FieldConstraint[];
    fieldDependencies: FieldDependency[];
    objectSchema: SalesforceObject;
  }> {
    const cacheKey = `validation-context:${objectName}`;
    
    // Check cache first
    if (this.config.cacheValidationResults && this.cache[cacheKey]) {
      const cached = this.cache[cacheKey];
      if (Date.now() - cached.timestamp.getTime() < cached.ttl) {
        console.log(`📦 Using cached validation context for ${objectName}`);
        
        // Get object schema separately as it's not cached in the same way
        const objectSchema = await this.config.enhancedDiscovery.getEnhancedObject(objectName, {
          includeValidationRules: false // We have the rules from cache
        });

        return {
          validationRules: cached.validationRules,
          fieldConstraints: cached.fieldConstraints,
          fieldDependencies: cached.fieldDependencies,
          objectSchema
        };
      } else {
        delete this.cache[cacheKey];
      }
    }

    // Fetch fresh data
    console.log(`🔄 Fetching validation context for ${objectName}`);
    const objectSchema = await this.config.enhancedDiscovery.getEnhancedObject(objectName, {
      includeValidationRules: true,
      includeSchemaAnalysis: true
    });

    const validationRules = objectSchema.validationRules || [];
    const schemaAnalysis = objectSchema.schemaAnalysis;
    
    const fieldConstraints = schemaAnalysis?.fieldConstraints || this.extractFieldConstraints(objectSchema);
    const fieldDependencies = schemaAnalysis?.fieldDependencies || this.extractFieldDependencies(validationRules);

    // Cache the result
    if (this.config.cacheValidationResults) {
      this.cache[cacheKey] = {
        objectName,
        validationRules,
        fieldConstraints,
        fieldDependencies,
        timestamp: new Date(),
        ttl: this.DEFAULT_CACHE_TTL
      };
    }

    return {
      validationRules,
      fieldConstraints,
      fieldDependencies,
      objectSchema
    };
  }

  private async validateRecordLocally(
    record: Record<string, any>,
    validationContext: any,
    includeWarnings: boolean
  ): Promise<Omit<RecordValidationResult, 'recordIndex'>> {
    const violations: ValidationViolation[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestedFixes: FieldSuggestion[] = [];

    // Validate against field constraints
    for (const constraint of validationContext.fieldConstraints) {
      const violation = this.checkFieldConstraint(record, constraint);
      if (violation) {
        violations.push(violation);
      }
    }

    // Validate against validation rules
    for (const rule of validationContext.validationRules) {
      if (!rule.active) continue;

      const ruleViolation = this.evaluateValidationRule(record, rule);
      if (ruleViolation) {
        violations.push(ruleViolation);
      }
    }

    // Check field dependencies
    for (const dependency of validationContext.fieldDependencies) {
      const dependencyViolation = this.checkFieldDependency(record, dependency);
      if (dependencyViolation) {
        violations.push(dependencyViolation);
      }
    }

    // Generate warnings if requested
    if (includeWarnings) {
      warnings.push(...this.generateWarnings(record, validationContext));
    }

    // Generate suggested fixes for violations
    for (const violation of violations) {
      const fix = this.generateLocalFix(violation, record, validationContext);
      if (fix) {
        suggestedFixes.push(fix);
      }
    }

    const riskScore = this.calculateRecordRiskScore(violations, warnings);

    return {
      isValid: violations.length === 0,
      violations,
      warnings,
      riskScore,
      suggestedFixes,
      aiAnalysisUsed: false
    };
  }

  private checkFieldConstraint(record: Record<string, any>, constraint: FieldConstraint): ValidationViolation | null {
    const fieldValue = record[constraint.field];

    switch (constraint.type) {
      case 'required':
        if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
          return {
            field: constraint.field,
            rule: 'required_field',
            severity: constraint.severity,
            message: constraint.errorMessage || `${constraint.field} is required`,
            suggestedFix: 'Provide a non-empty value for this field'
          };
        }
        break;

      case 'unique':
        // Note: Uniqueness can't be fully validated without database access
        // This is a placeholder for future enhancement
        if (typeof fieldValue === 'string' && fieldValue.length < 3) {
          return {
            field: constraint.field,
            rule: 'unique_field_quality',
            severity: 'warning' as const,
            message: `${constraint.field} value may not be sufficiently unique`,
            suggestedFix: 'Consider using a longer, more unique value'
          };
        }
        break;

      case 'format':
        // Basic format validation - could be enhanced
        if (fieldValue && typeof fieldValue === 'string') {
          if (constraint.constraint.includes('EMAIL') && !this.isValidEmail(fieldValue)) {
            return {
              field: constraint.field,
              rule: 'format_validation',
              severity: constraint.severity,
              message: constraint.errorMessage || `${constraint.field} must be a valid email`,
              suggestedFix: 'Provide a valid email format'
            };
          }
        }
        break;

      case 'range':
        if (fieldValue !== null && fieldValue !== undefined) {
          const numValue = Number(fieldValue);
          if (!isNaN(numValue)) {
            // Extract range from constraint (simplified)
            const rangeMatch = constraint.constraint.match(/(\d+).*?(\d+)/);
            if (rangeMatch) {
              const [, min, max] = rangeMatch;
              if (numValue < Number(min) || numValue > Number(max)) {
                return {
                  field: constraint.field,
                  rule: 'range_validation',
                  severity: constraint.severity,
                  message: constraint.errorMessage || `${constraint.field} must be between ${min} and ${max}`,
                  suggestedFix: `Provide a value between ${min} and ${max}`
                };
              }
            }
          }
        }
        break;
    }

    return null;
  }

  private evaluateValidationRule(record: Record<string, any>, rule: ValidationRuleMetadata): ValidationViolation | null {
    try {
      // Parse the validation rule formula
      const parsed = parseValidationRuleFormula(rule.errorConditionFormula, '');
      
      // Simple evaluation for common patterns
      if (parsed.patterns.includes('REQUIRED_FIELD_CHECK')) {
        // Look for ISBLANK or ISNULL patterns
        const fieldMatch = rule.errorConditionFormula.match(/ISBLANK\s*\(\s*([A-Za-z][A-Za-z0-9_]*(?:__c|__r)?)\s*\)/i) ||
                          rule.errorConditionFormula.match(/ISNULL\s*\(\s*([A-Za-z][A-Za-z0-9_]*(?:__c|__r)?)\s*\)/i);
        
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const fieldValue = record[fieldName];
          
          if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
            return {
              field: fieldName,
              rule: rule.id,
              severity: 'error',
              message: rule.errorMessage,
              suggestedFix: `Provide a value for ${fieldName}`
            };
          }
        }
      }

      // For more complex rules, we'd need a more sophisticated formula evaluator
      // This is a simplified implementation

      return null;
    } catch (error) {
      console.warn(`Failed to evaluate validation rule ${rule.id}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private checkFieldDependency(record: Record<string, any>, dependency: FieldDependency): ValidationViolation | null {
    const sourceValue = record[dependency.sourceField];
    const targetValue = record[dependency.targetField];

    switch (dependency.type) {
      case 'required_if':
        if (dependency.condition && this.evaluateCondition(sourceValue, dependency.condition)) {
          if (targetValue === null || targetValue === undefined || targetValue === '') {
            return {
              field: dependency.targetField,
              rule: 'conditional_requirement',
              severity: 'error',
              message: `${dependency.targetField} is required when ${dependency.sourceField} ${dependency.condition}`,
              suggestedFix: `Provide a value for ${dependency.targetField}`
            };
          }
        }
        break;

      case 'conditional':
        // Handle AND/OR dependencies
        if (dependency.operator === 'AND') {
          if ((sourceValue === null || sourceValue === undefined || sourceValue === '') &&
              (targetValue === null || targetValue === undefined || targetValue === '')) {
            return {
              field: dependency.targetField,
              rule: 'conditional_dependency',
              severity: 'warning',
              message: `Both ${dependency.sourceField} and ${dependency.targetField} should have values`,
              suggestedFix: `Provide values for both fields`
            };
          }
        }
        break;
    }

    return null;
  }

  private generateWarnings(record: Record<string, any>, validationContext: any): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for potential data quality issues
    for (const [field, value] of Object.entries(record)) {
      if (typeof value === 'string') {
        // Too short values
        if (value.length < 2) {
          warnings.push({
            field,
            type: 'data_quality',
            message: `${field} value may be too short`,
            severity: 'low',
            suggestion: 'Consider using a longer, more realistic value'
          });
        }

        // Placeholder values
        if (value.toLowerCase().includes('test') || value.toLowerCase().includes('sample')) {
          warnings.push({
            field,
            type: 'data_quality',
            message: `${field} appears to contain placeholder text`,
            severity: 'medium',
            suggestion: 'Use more realistic data'
          });
        }
      }
    }

    return warnings;
  }

  private generateLocalFix(
    violation: ValidationViolation, 
    record: Record<string, any>, 
    validationContext: any
  ): FieldSuggestion | null {
    switch (violation.rule) {
      case 'required_field':
        return {
          field: violation.field,
          currentValue: record[violation.field],
          suggestedValue: this.generateDefaultValue(violation.field, validationContext),
          reason: 'Field is required but empty',
          confidence: 0.8,
          aiGenerated: false
        };

      case 'format_validation':
        if (violation.field.toLowerCase().includes('email')) {
          return {
            field: violation.field,
            currentValue: record[violation.field],
            suggestedValue: `user${Math.floor(Math.random() * 1000)}@example.com`,
            reason: 'Generate valid email format',
            confidence: 0.9,
            aiGenerated: false
          };
        }
        break;
    }

    return null;
  }

  private async enhanceWithAIAnalysis(
    record: Record<string, any>,
    localResult: Omit<RecordValidationResult, 'recordIndex'>,
    validationContext: any,
    objectName: string
  ): Promise<Omit<RecordValidationResult, 'recordIndex'>> {
    if (!this.config.aiService) {
      return localResult;
    }

    try {
      // Create validation rules in the format expected by AI service
      const aiValidationRules = validationContext.validationRules.map((rule: ValidationRuleMetadata) => ({
        type: 'custom' as const,
        field: rule.fields?.[0] || 'unknown',
        constraint: rule.errorConditionFormula,
        errorMessage: rule.errorMessage,
        severity: 'error' as const
      }));

      const aiResult = await this.config.aiService.validateDataPattern(record, aiValidationRules);

      // Generate AI-powered suggestions
      const aiSuggestions: FieldSuggestion[] = [];
      for (const suggestion of aiResult.suggestions || []) {
        // Parse AI suggestions (simplified)
        const suggestionMatch = suggestion.match(/(\w+):\s*(.+?)(?:\s*\(confidence:\s*([\d.]+)\))?$/);
        if (suggestionMatch) {
          const [, field, reason, confidence] = suggestionMatch;
          aiSuggestions.push({
            field,
            currentValue: record[field],
            suggestedValue: null, // AI would need to provide this
            reason,
            confidence: confidence ? parseFloat(confidence) : 0.7,
            aiGenerated: true
          });
        }
      }

      return {
        isValid: aiResult.isValid && localResult.isValid,
        violations: [...localResult.violations, ...aiResult.violations],
        warnings: localResult.warnings,
        riskScore: Math.max(localResult.riskScore, aiResult.riskScore),
        suggestedFixes: [...localResult.suggestedFixes, ...aiSuggestions],
        aiAnalysisUsed: true
      };

    } catch (error) {
      console.warn(`AI enhancement failed: ${error instanceof Error ? error.message : error}`);
      return localResult;
    }
  }

  private shouldUseAIAnalysis(request: ValidationRequest, localResult: any): boolean {
    if (!this.config.enableAIAnalysis || request.skipAIAnalysis) {
      return false;
    }

    // Use AI for complex cases or when local validation finds issues
    return !localResult.isValid || 
           localResult.riskScore > 5 || 
           request.validationLevel === 'comprehensive';
  }

  private calculateRecordRiskScore(violations: ValidationViolation[], warnings: ValidationWarning[]): number {
    let score = 0;
    
    violations.forEach(violation => {
      switch (violation.severity) {
        case 'error': score += 3; break;
        case 'warning': score += 1; break;
      }
    });

    warnings.forEach(warning => {
      switch (warning.severity) {
        case 'high': score += 2; break;
        case 'medium': score += 1; break;
        case 'low': score += 0.5; break;
      }
    });

    return Math.min(score, 10); // Cap at 10
  }

  private calculateOverallRiskScore(results: RecordValidationResult[]): number {
    if (results.length === 0) return 0;
    
    const totalRisk = results.reduce((sum, result) => sum + result.riskScore, 0);
    return totalRisk / results.length;
  }

  private generateRecommendations(results: RecordValidationResult[], validationContext: any): string[] {
    const recommendations: string[] = [];
    
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
    const errorRate = results.filter(r => !r.isValid).length / results.length;

    if (errorRate > 0.1) {
      recommendations.push('High error rate detected - review data generation patterns');
    }

    if (totalViolations > 0) {
      recommendations.push('Consider adjusting data generation to avoid validation violations');
    }

    const commonFields = this.findCommonViolationFields(results);
    if (commonFields.length > 0) {
      recommendations.push(`Focus on improving data quality for fields: ${commonFields.join(', ')}`);
    }

    return recommendations;
  }

  private findCommonViolationFields(results: RecordValidationResult[]): string[] {
    const fieldCounts: Record<string, number> = {};
    
    results.forEach(result => {
      result.violations.forEach(violation => {
        fieldCounts[violation.field] = (fieldCounts[violation.field] || 0) + 1;
      });
    });

    return Object.entries(fieldCounts)
      .filter(([, count]) => count > results.length * 0.2) // Fields with issues in >20% of records
      .map(([field]) => field);
  }

  // Helper methods

  private extractFieldConstraints(object: SalesforceObject): FieldConstraint[] {
    const constraints: FieldConstraint[] = [];
    
    object.fields.forEach(field => {
      if (field.required) {
        constraints.push({
          field: field.name,
          type: 'required',
          constraint: 'NOT_NULL',
          severity: 'error'
        });
      }
      
      if (field.unique) {
        constraints.push({
          field: field.name,
          type: 'unique',
          constraint: 'UNIQUE_VALUE',
          severity: 'error'
        });
      }
    });

    return constraints;
  }

  private extractFieldDependencies(validationRules: ValidationRuleMetadata[]): FieldDependency[] {
    const dependencies: FieldDependency[] = [];
    
    validationRules.forEach(rule => {
      if (rule.dependencies) {
        dependencies.push(...rule.dependencies);
      }
    });

    return dependencies;
  }

  private createSampleRecord(config: Record<string, any>): Record<string, any> {
    // Create a sample record based on the generation config
    // This is a simplified implementation
    return {
      Name: config.name || 'Sample Record',
      ...config
    };
  }

  private analyzeRulesLocally(validationContext: any) {
    return parseObjectValidationRules(validationContext.validationRules, validationContext.objectSchema.name);
  }

  private anonymizeValidationRules(validationContext: any) {
    // Create anonymized version for AI analysis
    return {
      objectType: 'ANONYMIZED_OBJECT',
      validationRules: validationContext.validationRules.map((rule: ValidationRuleMetadata, index: number) => ({
        ...rule,
        id: `RULE_${index + 1}`,
        fullName: `ANONYMIZED_RULE_${index + 1}`,
        fields: rule.fields?.map((field, fieldIndex) => `FIELD_${fieldIndex + 1}`)
      }))
    };
  }

  private combineAnalysis(localAnalysis: any, aiAnalysis: any) {
    return {
      localComplexity: localAnalysis.overallComplexity,
      aiComplexity: aiAnalysis?.complexity,
      combinedRisk: aiAnalysis ? Math.max(
        localAnalysis.overallRisk === 'high' ? 3 : localAnalysis.overallRisk === 'medium' ? 2 : 1,
        aiAnalysis.riskFactors?.length || 0
      ) : localAnalysis.overallRisk,
      fieldCount: localAnalysis.allFields.length,
      dependencyCount: localAnalysis.allDependencies.length
    };
  }

  private generateFieldRecommendations(validationContext: any, aiAnalysis: any): Record<string, any> {
    const recommendations: Record<string, any> = {};
    
    validationContext.validationRules.forEach((rule: ValidationRuleMetadata) => {
      if (rule.fields) {
        rule.fields.forEach(field => {
          if (!recommendations[field]) {
            recommendations[field] = {
              constraints: [],
              suggestions: []
            };
          }
          
          recommendations[field].constraints.push({
            rule: rule.id,
            formula: rule.errorConditionFormula,
            message: rule.errorMessage
          });
        });
      }
    });

    return recommendations;
  }

  private assessValidationRisk(validationContext: any) {
    const riskFactors = [];
    
    if (validationContext.validationRules.length > 10) {
      riskFactors.push('High number of validation rules');
    }
    
    if (validationContext.fieldDependencies.length > 5) {
      riskFactors.push('Complex field dependencies');
    }

    const highRiskRules = validationContext.validationRules.filter((rule: ValidationRuleMetadata) => 
      rule.riskLevel === 'high'
    );
    
    if (highRiskRules.length > 0) {
      riskFactors.push(`${highRiskRules.length} high-risk validation rules`);
    }

    return {
      overallRisk: riskFactors.length >= 3 ? 'high' : riskFactors.length >= 1 ? 'medium' : 'low',
      riskFactors,
      recommendations: this.generateRiskRecommendations(riskFactors)
    };
  }

  private generateRiskRecommendations(riskFactors: string[]): string[] {
    const recommendations = [];
    
    if (riskFactors.some(f => f.includes('High number'))) {
      recommendations.push('Consider simplifying validation rules where possible');
    }
    
    if (riskFactors.some(f => f.includes('Complex field'))) {
      recommendations.push('Test field dependencies thoroughly during data generation');
    }
    
    if (riskFactors.some(f => f.includes('high-risk'))) {
      recommendations.push('Use AI analysis for high-risk validation rules');
    }

    return recommendations;
  }

  private generateDefaultValue(fieldName: string, validationContext: any): any {
    // Simple default value generation based on field name patterns
    const lowerFieldName = fieldName.toLowerCase();
    
    if (lowerFieldName.includes('name')) return 'Sample Name';
    if (lowerFieldName.includes('email')) return 'user@example.com';
    if (lowerFieldName.includes('phone')) return '555-123-4567';
    if (lowerFieldName.includes('date')) return new Date().toISOString().split('T')[0];
    if (lowerFieldName.includes('amount') || lowerFieldName.includes('price')) return 100;
    
    return 'Sample Value';
  }

  private evaluateCondition(value: any, condition: string): boolean {
    // Simplified condition evaluation
    if (condition.includes('=')) {
      const [, expectedValue] = condition.split('=').map(s => s.trim());
      return value?.toString() === expectedValue.replace(/['"]/g, '');
    }
    
    return false;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private getCacheHits(): number {
    // Simplified cache hit tracking
    return Object.keys(this.cache).length;
  }

  private getCacheMisses(): number {
    // Would need proper implementation with hit/miss tracking
    return 0;
  }

  private updatePerformanceMetrics(totalTime: number, aiUsed: boolean): void {
    this.performanceMetrics.totalValidations++;
    this.performanceMetrics.successfulValidations++; // Assuming success if we got here
    
    if (aiUsed) {
      this.performanceMetrics.aiAnalysisUsed++;
    }
    
    // Update average response time
    this.performanceMetrics.avgResponseTime = 
      (this.performanceMetrics.avgResponseTime * (this.performanceMetrics.totalValidations - 1) + totalTime) / 
      this.performanceMetrics.totalValidations;
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(this.cache).forEach(key => {
      const entry = this.cache[key];
      if (now - entry.timestamp.getTime() > entry.ttl) {
        delete this.cache[key];
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired validation cache entries`);
    }
  }
}