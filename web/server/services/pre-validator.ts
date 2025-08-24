import FormulaEvaluator from '../lib/formula-evaluator.js';

interface ValidationRule {
  fullName: string;
  active: boolean;
  description?: string;
  errorConditionFormula: string;
  errorMessage: string;
  errorDisplayField?: string;
}

interface FieldMetadata {
  name: string;
  type: string;
  required?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  picklistValues?: string[];
  referenceTo?: string[];
}

interface PreValidationResult {
  isValid: boolean;
  violations: ValidationViolation[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
  performance: {
    evaluationTime: number;
    rulesEvaluated: number;
    recordsProcessed: number;
  };
}

interface ValidationViolation {
  ruleId: string;
  ruleName: string;
  field?: string;
  message: string;
  formula: string;
  severity: 'error' | 'warning';
  recordIndex?: number;
  suggestedFix?: string;
}

interface ValidationWarning {
  type: 'unsupported_formula' | 'complex_logic' | 'performance';
  message: string;
  ruleId?: string;
  details?: any;
}

interface ValidationSuggestion {
  field: string;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  confidence: number; // 0-1
}

interface PreValidationOptions {
  includeWarnings?: boolean;
  includeSuggestions?: boolean;
  maxRecords?: number;
  timeoutMs?: number;
  skipUnsupportedRules?: boolean;
  optimizeForPerformance?: boolean;
}

/**
 * Pre-validation service that simulates Salesforce validation rules locally
 */
export class PreValidator {
  private formulaEvaluator: FormulaEvaluator;
  private cache: Map<string, any>;
  private performanceMetrics: {
    totalEvaluations: number;
    totalTime: number;
    averageTime: number;
    cacheHits: number;
  };

  constructor() {
    this.formulaEvaluator = new FormulaEvaluator();
    this.cache = new Map();
    this.performanceMetrics = {
      totalEvaluations: 0,
      totalTime: 0,
      averageTime: 0,
      cacheHits: 0
    };
  }

  /**
   * Pre-validate records against validation rules
   */
  async preValidateRecords(
    records: any[],
    validationRules: ValidationRule[],
    fieldMetadata: { [fieldName: string]: FieldMetadata },
    options: PreValidationOptions = {}
  ): Promise<PreValidationResult> {
    const startTime = Date.now();
    const {
      includeWarnings = true,
      includeSuggestions = true,
      maxRecords = 1000,
      timeoutMs = 30000,
      skipUnsupportedRules = true,
      optimizeForPerformance = false
    } = options;

    // Limit records for performance
    const recordsToProcess = records.slice(0, maxRecords);
    
    const violations: ValidationViolation[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];
    let rulesEvaluated = 0;

    // Filter and prepare validation rules
    const activeRules = validationRules.filter(rule => rule.active);
    const { supportedRules, unsupportedRules } = this.categorizeRules(activeRules);

    if (includeWarnings && unsupportedRules.length > 0) {
      warnings.push({
        type: 'unsupported_formula',
        message: `${unsupportedRules.length} validation rules use unsupported formula functions`,
        details: { unsupportedRules: unsupportedRules.map(r => r.fullName) }
      });
    }

    // Process each record
    for (let recordIndex = 0; recordIndex < recordsToProcess.length; recordIndex++) {
      if (Date.now() - startTime > timeoutMs) {
        warnings.push({
          type: 'performance',
          message: 'Validation timeout reached, some records may not be fully validated'
        });
        break;
      }

      const record = recordsToProcess[recordIndex];
      const recordViolations = await this.validateRecord(
        record,
        supportedRules,
        fieldMetadata,
        recordIndex
      );

      violations.push(...recordViolations);
      rulesEvaluated += supportedRules.length;

      // Generate suggestions for violations
      if (includeSuggestions && recordViolations.length > 0) {
        const recordSuggestions = this.generateSuggestions(
          record,
          recordViolations,
          fieldMetadata
        );
        suggestions.push(...recordSuggestions);
      }
    }

    const evaluationTime = Date.now() - startTime;
    this.updatePerformanceMetrics(evaluationTime, rulesEvaluated);

    return {
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      warnings,
      suggestions,
      performance: {
        evaluationTime,
        rulesEvaluated,
        recordsProcessed: recordsToProcess.length
      }
    };
  }

  /**
   * Validate a single record against validation rules
   */
  private async validateRecord(
    record: any,
    rules: ValidationRule[],
    fieldMetadata: { [fieldName: string]: FieldMetadata },
    recordIndex: number
  ): Promise<ValidationViolation[]> {
    const violations: ValidationViolation[] = [];

    for (const rule of rules) {
      try {
        // Check cache first
        const cacheKey = this.generateCacheKey(rule.fullName, record);
        if (this.cache.has(cacheKey)) {
          this.performanceMetrics.cacheHits++;
          const cachedResult = this.cache.get(cacheKey);
          if (cachedResult.violates) {
            violations.push({
              ruleId: rule.fullName,
              ruleName: rule.fullName,
              message: rule.errorMessage,
              formula: rule.errorConditionFormula,
              severity: 'error',
              recordIndex,
              field: rule.errorDisplayField
            });
          }
          continue;
        }

        // Evaluate the rule formula
        const violatesRule = this.formulaEvaluator.evaluate(
          rule.errorConditionFormula,
          record,
          fieldMetadata
        );

        // Cache the result
        this.cache.set(cacheKey, { violates: violatesRule });

        if (violatesRule) {
          violations.push({
            ruleId: rule.fullName,
            ruleName: rule.fullName,
            message: rule.errorMessage,
            formula: rule.errorConditionFormula,
            severity: 'error',
            recordIndex,
            field: rule.errorDisplayField
          });
        }

      } catch (error) {
        console.warn(`Failed to evaluate validation rule ${rule.fullName}:`, error.message);
        // Continue with other rules instead of failing completely
      }
    }

    return violations;
  }

  /**
   * Categorize rules as supported or unsupported
   */
  private categorizeRules(rules: ValidationRule[]): {
    supportedRules: ValidationRule[];
    unsupportedRules: ValidationRule[];
  } {
    const supportedRules: ValidationRule[] = [];
    const unsupportedRules: ValidationRule[] = [];

    for (const rule of rules) {
      if (this.formulaEvaluator.canEvaluate(rule.errorConditionFormula)) {
        supportedRules.push(rule);
      } else {
        unsupportedRules.push(rule);
      }
    }

    return { supportedRules, unsupportedRules };
  }

  /**
   * Generate suggestions to fix validation violations
   */
  private generateSuggestions(
    record: any,
    violations: ValidationViolation[],
    fieldMetadata: { [fieldName: string]: FieldMetadata }
  ): ValidationSuggestion[] {
    const suggestions: ValidationSuggestion[] = [];

    for (const violation of violations) {
      const suggestion = this.generateSuggestionForViolation(
        record,
        violation,
        fieldMetadata
      );
      
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Generate a suggestion for a specific violation
   */
  private generateSuggestionForViolation(
    record: any,
    violation: ValidationViolation,
    fieldMetadata: { [fieldName: string]: FieldMetadata }
  ): ValidationSuggestion | null {
    const formula = violation.formula;

    // Handle common patterns
    
    // ISBLANK checks - suggest non-empty values
    if (formula.includes('ISBLANK(') && violation.field) {
      const fieldMeta = fieldMetadata[violation.field];
      let suggestedValue: any;

      switch (fieldMeta?.type) {
        case 'email':
          suggestedValue = 'user@example.com';
          break;
        case 'phone':
          suggestedValue = '(555) 123-4567';
          break;
        case 'string':
        case 'textarea':
          suggestedValue = `Sample ${violation.field}`;
          break;
        case 'number':
        case 'currency':
          suggestedValue = 1;
          break;
        case 'boolean':
          suggestedValue = true;
          break;
        case 'date':
          suggestedValue = new Date().toISOString().split('T')[0];
          break;
        case 'datetime':
          suggestedValue = new Date().toISOString();
          break;
        default:
          suggestedValue = 'Required Value';
      }

      return {
        field: violation.field,
        currentValue: record[violation.field],
        suggestedValue,
        reason: `Field is required by validation rule: ${violation.ruleName}`,
        confidence: 0.9
      };
    }

    // Length checks - suggest appropriate length values
    if (formula.includes('LEN(') && violation.field) {
      const lengthMatch = formula.match(/LEN\([^)]+\)\s*([<>=!]+)\s*(\d+)/);
      if (lengthMatch) {
        const operator = lengthMatch[1];
        const limit = parseInt(lengthMatch[2]);
        const currentValue = String(record[violation.field] || '');

        let suggestedValue: string;
        if (operator.includes('<')) {
          // Value too long
          suggestedValue = currentValue.substring(0, limit - 1);
        } else if (operator.includes('>')) {
          // Value too short
          suggestedValue = currentValue.padEnd(limit + 1, 'X');
        } else {
          suggestedValue = currentValue.substring(0, limit);
        }

        return {
          field: violation.field,
          currentValue: record[violation.field],
          suggestedValue,
          reason: `Adjust field length to meet validation requirements`,
          confidence: 0.8
        };
      }
    }

    // Picklist value checks
    if (formula.includes('ISPICKVAL(') && violation.field) {
      const fieldMeta = fieldMetadata[violation.field];
      if (fieldMeta?.picklistValues && fieldMeta.picklistValues.length > 0) {
        return {
          field: violation.field,
          currentValue: record[violation.field],
          suggestedValue: fieldMeta.picklistValues[0],
          reason: 'Use a valid picklist value',
          confidence: 0.7
        };
      }
    }

    // Numeric range checks
    const numericRangeMatch = formula.match(/(\w+)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/);
    if (numericRangeMatch && violation.field) {
      const field = numericRangeMatch[1];
      const operator = numericRangeMatch[2];
      const limit = parseFloat(numericRangeMatch[3]);

      if (field === violation.field) {
        let suggestedValue: number;
        if (operator.includes('<')) {
          suggestedValue = limit - 1;
        } else if (operator.includes('>')) {
          suggestedValue = limit + 1;
        } else {
          suggestedValue = limit;
        }

        return {
          field: violation.field,
          currentValue: record[violation.field],
          suggestedValue,
          reason: `Adjust numeric value to meet validation requirements`,
          confidence: 0.8
        };
      }
    }

    return null;
  }

  /**
   * Apply suggestions to fix record data
   */
  async applySuggestions(
    record: any,
    suggestions: ValidationSuggestion[],
    confidenceThreshold: number = 0.5
  ): Promise<any> {
    const fixedRecord = { ...record };

    for (const suggestion of suggestions) {
      if (suggestion.confidence >= confidenceThreshold) {
        fixedRecord[suggestion.field] = suggestion.suggestedValue;
      }
    }

    return fixedRecord;
  }

  /**
   * Batch process multiple records with performance optimization
   */
  async batchPreValidate(
    recordBatches: any[][],
    validationRules: ValidationRule[],
    fieldMetadata: { [fieldName: string]: FieldMetadata },
    options: PreValidationOptions = {}
  ): Promise<PreValidationResult[]> {
    const results: PreValidationResult[] = [];

    for (let i = 0; i < recordBatches.length; i++) {
      const batch = recordBatches[i];
      console.log(`Pre-validating batch ${i + 1}/${recordBatches.length} (${batch.length} records)`);

      const result = await this.preValidateRecords(
        batch,
        validationRules,
        fieldMetadata,
        { ...options, optimizeForPerformance: true }
      );

      results.push(result);

      // Clear cache periodically to prevent memory buildup
      if (i % 10 === 0) {
        this.clearCache();
      }
    }

    return results;
  }

  /**
   * Optimized validation for large datasets using parallel processing
   */
  async preValidateLargeDataset(
    records: any[],
    validationRules: ValidationRule[],
    fieldMetadata: { [fieldName: string]: FieldMetadata },
    options: PreValidationOptions = {}
  ): Promise<PreValidationResult> {
    const {
      includeWarnings = true,
      includeSuggestions = false, // Disable suggestions for large datasets by default
      maxRecords = 10000,
      timeoutMs = 120000, // 2 minutes for large datasets
      skipUnsupportedRules = true,
      optimizeForPerformance = true
    } = options;

    const startTime = Date.now();
    const recordsToProcess = records.slice(0, maxRecords);
    
    // Pre-filter rules for performance
    const { supportedRules, unsupportedRules } = this.categorizeRules(validationRules.filter(r => r.active));
    
    // For very large datasets, use sampling to estimate validation success
    const useSampling = recordsToProcess.length > 1000;
    const sampleSize = Math.min(100, Math.floor(recordsToProcess.length * 0.1));
    const recordsToValidate = useSampling ? 
      this.sampleRecords(recordsToProcess, sampleSize) : 
      recordsToProcess;

    console.log(`Pre-validating ${recordsToValidate.length} records (${useSampling ? 'sampled from ' + recordsToProcess.length : 'full dataset'})`);

    // Parallel processing for large rule sets
    const chunkSize = Math.max(1, Math.floor(recordsToValidate.length / 4)); // Process in 4 chunks
    const chunks = this.chunkArray(recordsToValidate, chunkSize);
    
    const violations: ValidationViolation[] = [];
    const warnings: ValidationWarning[] = [];
    let rulesEvaluated = 0;

    // Process chunks in parallel
    const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
      const chunkViolations: ValidationViolation[] = [];
      
      for (let recordIndex = 0; recordIndex < chunk.length; recordIndex++) {
        if (Date.now() - startTime > timeoutMs) {
          warnings.push({
            type: 'performance',
            message: 'Validation timeout reached during chunk processing'
          });
          break;
        }

        const record = chunk[recordIndex];
        const recordViolations = await this.validateRecordOptimized(
          record,
          supportedRules,
          fieldMetadata,
          chunkIndex * chunkSize + recordIndex
        );

        chunkViolations.push(...recordViolations);
      }
      
      return {
        violations: chunkViolations,
        rulesEvaluated: supportedRules.length * chunk.length
      };
    });

    const chunkResults = await Promise.all(chunkPromises);
    
    // Aggregate results
    chunkResults.forEach(result => {
      violations.push(...result.violations);
      rulesEvaluated += result.rulesEvaluated;
    });

    // Generate warnings for unsupported rules
    if (includeWarnings && unsupportedRules.length > 0) {
      warnings.push({
        type: 'unsupported_formula',
        message: `${unsupportedRules.length} validation rules use unsupported formula functions`,
        details: { unsupportedRules: unsupportedRules.slice(0, 10).map(r => r.fullName) } // Limit to first 10
      });
    }

    // Estimate results for full dataset if sampling was used
    let adjustedViolations = violations;
    if (useSampling && violations.length > 0) {
      const violationRate = violations.length / recordsToValidate.length;
      const estimatedTotalViolations = Math.round(violationRate * recordsToProcess.length);
      
      warnings.push({
        type: 'performance',
        message: `Results estimated from sample of ${sampleSize} records. Estimated ${estimatedTotalViolations} total violations.`,
        details: { sampleSize, estimatedTotal: estimatedTotalViolations }
      });
    }

    const evaluationTime = Date.now() - startTime;
    this.updatePerformanceMetrics(evaluationTime, rulesEvaluated);

    return {
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations: adjustedViolations,
      warnings,
      suggestions: [], // Skip suggestions for large datasets
      performance: {
        evaluationTime,
        rulesEvaluated,
        recordsProcessed: recordsToValidate.length
      }
    };
  }

  /**
   * Optimized single record validation with minimal allocations
   */
  private async validateRecordOptimized(
    record: any,
    rules: ValidationRule[],
    fieldMetadata: { [fieldName: string]: FieldMetadata },
    recordIndex: number
  ): Promise<ValidationViolation[]> {
    const violations: ValidationViolation[] = [];

    // Pre-compute record signature for cache key generation
    const recordKeys = Object.keys(record);
    
    for (const rule of rules) {
      try {
        // Fast cache key generation
        const cacheKey = `${rule.fullName}:${this.fastHash(record, recordKeys)}`;
        
        if (this.cache.has(cacheKey)) {
          this.performanceMetrics.cacheHits++;
          const cachedResult = this.cache.get(cacheKey);
          if (cachedResult.violates) {
            violations.push({
              ruleId: rule.fullName,
              ruleName: rule.fullName,
              message: rule.errorMessage,
              formula: rule.errorConditionFormula,
              severity: 'error',
              recordIndex,
              field: rule.errorDisplayField
            });
          }
          continue;
        }

        // Evaluate the rule formula
        const violatesRule = this.formulaEvaluator.evaluate(
          rule.errorConditionFormula,
          record,
          fieldMetadata
        );

        // Cache with memory-efficient storage
        if (this.cache.size < 10000) { // Limit cache size
          this.cache.set(cacheKey, { violates: violatesRule });
        }

        if (violatesRule) {
          violations.push({
            ruleId: rule.fullName,
            ruleName: rule.fullName,
            message: rule.errorMessage,
            formula: rule.errorConditionFormula,
            severity: 'error',
            recordIndex,
            field: rule.errorDisplayField
          });
        }

      } catch (error) {
        // Log but don't break processing
        console.warn(`Failed to evaluate validation rule ${rule.fullName}:`, error.message);
      }
    }

    return violations;
  }

  /**
   * Fast hash function for cache keys
   */
  private fastHash(record: any, keys: string[]): string {
    let hash = '';
    for (let i = 0; i < keys.length && i < 10; i++) { // Limit to first 10 keys for performance
      const key = keys[i];
      const value = record[key];
      if (value !== null && value !== undefined) {
        hash += `${key}:${String(value).slice(0, 20)};`; // Truncate long values
      }
    }
    return hash;
  }

  /**
   * Sample records for large dataset estimation
   */
  private sampleRecords(records: any[], sampleSize: number): any[] {
    const sampled: any[] = [];
    const step = Math.floor(records.length / sampleSize);
    
    for (let i = 0; i < records.length && sampled.length < sampleSize; i += step) {
      sampled.push(records[i]);
    }
    
    return sampled;
  }

  /**
   * Chunk array for parallel processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Generate cache key for rule evaluation
   */
  private generateCacheKey(ruleId: string, record: any): string {
    const relevantFields = this.extractFieldsFromFormula(ruleId);
    const relevantData = {};
    
    for (const field of relevantFields) {
      relevantData[field] = record[field];
    }

    return `${ruleId}:${JSON.stringify(relevantData)}`;
  }

  /**
   * Extract field names referenced in a formula
   */
  private extractFieldsFromFormula(formula: string): string[] {
    const fieldMatches = formula.match(/\b([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*)\b/g);
    if (!fieldMatches) return [];

    return fieldMatches.filter(match => 
      !this.formulaEvaluator.getSupportedFunctions().includes(match.toUpperCase()) &&
      !['true', 'false', 'null'].includes(match.toLowerCase()) &&
      !/^\d/.test(match)
    );
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(evaluationTime: number, rulesEvaluated: number): void {
    this.performanceMetrics.totalEvaluations += rulesEvaluated;
    this.performanceMetrics.totalTime += evaluationTime;
    this.performanceMetrics.averageTime = 
      this.performanceMetrics.totalTime / this.performanceMetrics.totalEvaluations;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    return {
      ...this.performanceMetrics,
      cacheSize: this.cache.size,
      supportedFunctions: this.formulaEvaluator.getSupportedFunctions().length
    };
  }

  /**
   * Clear cache to free memory
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get validation coverage statistics
   */
  async getValidationCoverage(
    validationRules: ValidationRule[]
  ): Promise<{
    total: number;
    supported: number;
    unsupported: number;
    coverage: number;
    unsupportedReasons: { [reason: string]: number };
  }> {
    const { supportedRules, unsupportedRules } = this.categorizeRules(validationRules);
    
    const unsupportedReasons: { [reason: string]: number } = {};
    
    for (const rule of unsupportedRules) {
      // Analyze why rules are unsupported
      const formula = rule.errorConditionFormula;
      let reason = 'complex_formula';
      
      if (formula.includes('$') || formula.includes('PRIORVALUE(')) {
        reason = 'system_context_functions';
      } else if (formula.includes('REGEX(') || formula.includes('FIND(')) {
        reason = 'advanced_text_functions';
      } else if (formula.includes('VLOOKUP(') || formula.includes('LOOKUP(')) {
        reason = 'lookup_functions';
      }
      
      unsupportedReasons[reason] = (unsupportedReasons[reason] || 0) + 1;
    }

    return {
      total: validationRules.length,
      supported: supportedRules.length,
      unsupported: unsupportedRules.length,
      coverage: validationRules.length > 0 ? (supportedRules.length / validationRules.length) * 100 : 0,
      unsupportedReasons
    };
  }

  /**
   * Validate data generation patterns against rules
   */
  async validateGenerationPattern(
    objectName: string,
    generationPattern: any,
    validationRules: ValidationRule[],
    fieldMetadata: { [fieldName: string]: FieldMetadata }
  ): Promise<{
    canGenerate: boolean;
    issues: string[];
    suggestions: string[];
    riskScore: number;
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let riskScore = 0;

    // Create sample records based on generation pattern
    const sampleRecords = this.generateSampleRecords(generationPattern, 5);
    
    // Pre-validate sample records
    const validation = await this.preValidateRecords(
      sampleRecords,
      validationRules,
      fieldMetadata,
      { includeWarnings: true, includeSuggestions: true }
    );

    if (validation.violations.length > 0) {
      riskScore += validation.violations.length * 20;
      issues.push(`Generation pattern violates ${validation.violations.length} validation rules`);
      
      const uniqueRuleViolations = new Set(validation.violations.map(v => v.ruleName));
      suggestions.push(`Consider adjusting generation parameters for rules: ${Array.from(uniqueRuleViolations).join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      riskScore += validation.warnings.length * 10;
      
      for (const warning of validation.warnings) {
        if (warning.type === 'unsupported_formula') {
          issues.push(warning.message);
          suggestions.push('Some validation rules cannot be pre-validated and may cause insertion failures');
        }
      }
    }

    return {
      canGenerate: validation.isValid && riskScore < 50,
      issues,
      suggestions,
      riskScore: Math.min(riskScore, 100)
    };
  }

  /**
   * Generate sample records for pattern testing
   */
  private generateSampleRecords(generationPattern: any, count: number): any[] {
    const records: any[] = [];
    
    for (let i = 0; i < count; i++) {
      const record: any = {};
      
      for (const [fieldName, config] of Object.entries(generationPattern.fields || {})) {
        // Generate sample values based on field configuration
        record[fieldName] = this.generateSampleValue(fieldName, config as any);
      }
      
      records.push(record);
    }
    
    return records;
  }

  /**
   * Generate a sample value for testing
   */
  private generateSampleValue(fieldName: string, config: any): any {
    if (config.type === 'string') {
      return config.required ? `Sample ${fieldName}` : null;
    } else if (config.type === 'email') {
      return 'test@example.com';
    } else if (config.type === 'phone') {
      return '(555) 123-4567';
    } else if (config.type === 'number' || config.type === 'currency') {
      return Math.floor(Math.random() * 100) + 1;
    } else if (config.type === 'boolean') {
      return Math.random() > 0.5;
    } else if (config.type === 'date') {
      return new Date().toISOString().split('T')[0];
    } else if (config.type === 'datetime') {
      return new Date().toISOString();
    }
    
    return null;
  }
}

export default PreValidator;