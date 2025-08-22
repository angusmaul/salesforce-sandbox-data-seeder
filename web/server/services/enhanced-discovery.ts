import { SalesforceService } from '../../../src/services/salesforce';
import { ObjectDiscoveryService } from '../../../src/services/object-discovery';
import { 
  SalesforceObject, 
  ValidationRuleMetadata, 
  SchemaAnalysis,
  FieldConstraint,
  FieldDependency 
} from '../../../src/models/salesforce';
import { parseObjectValidationRules } from '../lib/validation-rule-parser.js';
import { anonymizeObjectSchema, createAnonymizationSummary } from '../lib/schema-anonymizer.js';

interface EnhancedDiscoveryOptions {
  includeValidationRules?: boolean;
  includeSchemaAnalysis?: boolean;
  anonymizeForAI?: boolean;
  cacheResults?: boolean;
  batchSize?: number;
}

interface CacheEntry {
  data: any;
  timestamp: Date;
  ttl: number; // Time to live in milliseconds
}

/**
 * Enhanced Discovery Service
 * 
 * Extends the existing ObjectDiscoveryService to include:
 * - Validation rule extraction from Salesforce Metadata API
 * - Field dependency analysis
 * - Schema anonymization for AI processing
 * - Performance caching
 */
export class EnhancedDiscoveryService {
  private baseDiscoveryService: ObjectDiscoveryService;
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private salesforceService: SalesforceService) {
    this.baseDiscoveryService = new ObjectDiscoveryService(salesforceService);
    
    // Clean cache every hour (only if not in test environment)
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => this.cleanupCache(), 60 * 60 * 1000);
    }
  }

  /**
   * Enhanced object discovery with validation rules
   */
  async discoverObjectsWithValidation(options: EnhancedDiscoveryOptions = {}): Promise<SalesforceObject[]> {
    const {
      includeValidationRules = true,
      includeSchemaAnalysis = true,
      anonymizeForAI = false,
      cacheResults = true,
      batchSize = 10
    } = options;

    // Start with base discovery
    console.log('🔍 Starting enhanced object discovery...');
    const baseObjects = await this.baseDiscoveryService.discoverObjects(true);
    
    if (!includeValidationRules) {
      return baseObjects;
    }

    console.log(`📋 Enhancing ${baseObjects.length} objects with validation rules...`);
    
    // Process objects in batches for better performance
    const enhancedObjects: SalesforceObject[] = [];
    
    for (let i = 0; i < baseObjects.length; i += batchSize) {
      const batch = baseObjects.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (obj) => {
        try {
          const cacheKey = `validation-rules:${obj.name}`;
          
          // Check cache first
          if (cacheResults) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
              console.log(`📦 Using cached validation rules for ${obj.name}`);
              return { ...obj, ...cached };
            }
          }
          
          // Fetch validation rules
          const validationRules = await this.fetchValidationRules(obj.name);
          
          // Parse and analyze validation rules
          let schemaAnalysis: SchemaAnalysis | undefined;
          if (includeSchemaAnalysis && validationRules.length > 0) {
            schemaAnalysis = await this.analyzeObjectSchema(obj, validationRules);
          }
          
          const enhanced = {
            ...obj,
            validationRules,
            schemaAnalysis
          };
          
          // Cache the enhanced data
          if (cacheResults) {
            this.setCache(cacheKey, { validationRules, schemaAnalysis });
          }
          
          // Anonymize if requested
          if (anonymizeForAI) {
            return anonymizeObjectSchema(enhanced, {
              preserveStandardObjects: true,
              preserveStandardFields: true,
              includeFieldTypes: true,
              includeValidationRules: true
            });
          }
          
          return enhanced;
          
        } catch (error) {
          console.warn(`⚠️ Failed to enhance ${obj.name}: ${error instanceof Error ? error.message : error}`);
          return obj; // Return base object if enhancement fails
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      enhancedObjects.push(...batchResults);
      
      console.log(`✅ Enhanced ${Math.min(i + batchSize, baseObjects.length)}/${baseObjects.length} objects`);
    }
    
    console.log(`🎉 Enhanced discovery completed: ${enhancedObjects.length} objects`);
    return enhancedObjects;
  }

  /**
   * Fetch validation rules for a specific object
   */
  async fetchValidationRules(objectName: string): Promise<ValidationRuleMetadata[]> {
    try {
      // Use JSForce metadata API to fetch validation rules
      const conn = this.salesforceService.getConnection();
      
      // Query for validation rules using Metadata API
      const metadataQuery = {
        type: 'ValidationRule',
        folder: null
      };
      
      const listResult = await conn.metadata.list([metadataQuery]);
      
      if (!listResult) {
        return [];
      }
      
      // Filter validation rules for this object
      const objectValidationRules = Array.isArray(listResult) 
        ? listResult.filter((item: any) => item.fullName.startsWith(`${objectName}.`))
        : [listResult].filter((item: any) => item.fullName.startsWith(`${objectName}.`));
      
      if (objectValidationRules.length === 0) {
        return [];
      }
      
      // Retrieve detailed validation rule metadata
      const fullNames = objectValidationRules.map((rule: any) => rule.fullName);
      const retrieveResult = await conn.metadata.read('ValidationRule', fullNames);
      
      // Parse the validation rules from the retrieved metadata
      const validationRules: ValidationRuleMetadata[] = [];
      
      if (retrieveResult && Array.isArray(retrieveResult)) {
        for (const rule of retrieveResult) {
          validationRules.push(this.parseValidationRuleMetadata(rule, objectName));
        }
      } else if (retrieveResult) {
        validationRules.push(this.parseValidationRuleMetadata(retrieveResult, objectName));
      }
      
      return validationRules;
      
    } catch (error) {
      console.warn(`Warning: Could not fetch validation rules for ${objectName}: ${error instanceof Error ? error.message : error}`);
      
      // Fallback: Try to use the Tooling API as an alternative
      try {
        return await this.fetchValidationRulesViaToolingAPI(objectName);
      } catch (toolingError) {
        console.warn(`Tooling API fallback also failed for ${objectName}: ${toolingError instanceof Error ? toolingError.message : toolingError}`);
        return [];
      }
    }
  }

  /**
   * Fallback method using Tooling API to fetch validation rules
   */
  async fetchValidationRulesViaToolingAPI(objectName: string): Promise<ValidationRuleMetadata[]> {
    const conn = this.salesforceService.getConnection();
    
    const query = `
      SELECT Id, FullName, Active, Description, ErrorConditionFormula, 
             ErrorMessage, ErrorDisplayField, ValidationName,
             EntityDefinition.QualifiedApiName
      FROM ValidationRule 
      WHERE EntityDefinition.QualifiedApiName = '${objectName}'
      AND Active = true
    `;
    
    const result = await conn.tooling.query(query);
    
    if (!result.records || result.records.length === 0) {
      return [];
    }
    
    return result.records.map((record: any) => ({
      id: record.Id,
      fullName: record.FullName,
      active: record.Active,
      description: record.Description,
      errorConditionFormula: record.ErrorConditionFormula,
      errorMessage: record.ErrorMessage,
      errorDisplayField: record.ErrorDisplayField,
      validationName: record.ValidationName,
      complexity: 'simple' as const,
      riskLevel: 'low' as const
    }));
  }

  /**
   * Parse validation rule metadata from Salesforce response
   */
  private parseValidationRuleMetadata(ruleData: any, objectName: string): ValidationRuleMetadata {
    // Parse the validation rule formula to extract field dependencies
    const parsedRule = parseObjectValidationRules([{
      errorConditionFormula: ruleData.errorConditionFormula || '',
      active: ruleData.active !== false
    }], objectName);
    
    return {
      id: ruleData.id || ruleData.Id || '',
      fullName: ruleData.fullName || ruleData.FullName || '',
      active: ruleData.active !== false,
      description: ruleData.description || ruleData.Description,
      errorConditionFormula: ruleData.errorConditionFormula || ruleData.ErrorConditionFormula || '',
      errorMessage: ruleData.errorMessage || ruleData.ErrorMessage || '',
      errorDisplayField: ruleData.errorDisplayField || ruleData.ErrorDisplayField,
      validationName: ruleData.validationName || ruleData.ValidationName || '',
      fields: parsedRule.allFields,
      dependencies: parsedRule.allDependencies,
      complexity: parsedRule.overallComplexity,
      riskLevel: parsedRule.overallRisk
    };
  }

  /**
   * Analyze object schema with validation rules
   */
  async analyzeObjectSchema(object: SalesforceObject, validationRules: ValidationRuleMetadata[]): Promise<SchemaAnalysis> {
    const parsedRules = parseObjectValidationRules(validationRules, object.name);
    
    // Extract field constraints from validation rules
    const fieldConstraints: FieldConstraint[] = [];
    const fieldDependencies: FieldDependency[] = parsedRules.allDependencies;
    
    // Analyze required field patterns
    const requiredFieldPatterns: string[] = [];
    
    // Check for required fields
    object.fields.forEach(field => {
      if (field.required) {
        fieldConstraints.push({
          field: field.name,
          type: 'required',
          constraint: 'NOT_NULL',
          severity: 'error'
        });
        requiredFieldPatterns.push(`${field.name} is required`);
      }
      
      if (field.unique) {
        fieldConstraints.push({
          field: field.name,
          type: 'unique',
          constraint: 'UNIQUE_VALUE',
          severity: 'error'
        });
      }
    });
    
    // Extract constraints from validation rules
    validationRules.forEach(rule => {
      if (rule.fields) {
        rule.fields.forEach(fieldName => {
          fieldConstraints.push({
            field: fieldName,
            type: 'custom',
            constraint: rule.errorConditionFormula,
            validationRule: rule.id,
            errorMessage: rule.errorMessage,
            severity: 'error'
          });
        });
      }
    });
    
    // Calculate complexity score
    let complexityScore = 0;
    complexityScore += validationRules.length * 2; // Each validation rule adds complexity
    complexityScore += fieldDependencies.length; // Dependencies add complexity
    complexityScore += object.fields.filter(f => f.referenceTo && f.referenceTo.length > 0).length; // Lookups add complexity
    
    // Identify risk factors
    const riskFactors: string[] = [];
    if (validationRules.some(rule => rule.riskLevel === 'high')) {
      riskFactors.push('Contains high-risk validation rules');
    }
    if (fieldDependencies.length > 5) {
      riskFactors.push('Complex field dependencies');
    }
    if (object.fields.filter(f => f.required).length > 10) {
      riskFactors.push('Many required fields');
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    if (complexityScore > 20) {
      recommendations.push('Consider simplifying validation rules for better performance');
    }
    if (validationRules.length === 0 && object.fields.some(f => f.required)) {
      recommendations.push('Consider adding validation rules for data quality');
    }
    if (fieldDependencies.length > 0) {
      recommendations.push('Test data generation should respect field dependencies');
    }
    
    return {
      objectName: object.name,
      validationRules,
      fieldConstraints,
      fieldDependencies,
      requiredFieldPatterns,
      complexityScore,
      riskFactors,
      recommendations,
      anonymized: false,
      analysisTimestamp: new Date()
    };
  }

  /**
   * Get enhanced object with validation rules
   */
  async getEnhancedObject(objectName: string, options: EnhancedDiscoveryOptions = {}): Promise<SalesforceObject> {
    const baseObject = await this.baseDiscoveryService.describeObject(objectName, true);
    
    if (!options.includeValidationRules) {
      return baseObject;
    }
    
    const validationRules = await this.fetchValidationRules(objectName);
    let schemaAnalysis: SchemaAnalysis | undefined;
    
    if (options.includeSchemaAnalysis && validationRules.length > 0) {
      schemaAnalysis = await this.analyzeObjectSchema(baseObject, validationRules);
    }
    
    const enhanced = {
      ...baseObject,
      validationRules,
      schemaAnalysis
    };
    
    if (options.anonymizeForAI) {
      return anonymizeObjectSchema(enhanced, {
        preserveStandardObjects: true,
        preserveStandardFields: true,
        includeFieldTypes: true,
        includeValidationRules: true
      });
    }
    
    return enhanced;
  }

  /**
   * Create anonymized schema summary for AI analysis
   */
  async createAISchemaSummary(objects: SalesforceObject[]): Promise<{
    summary: any;
    anonymizationMap: Map<string, string>;
  }> {
    const anonymizationMap = new Map<string, string>();
    
    const anonymizedObjects = objects.map(obj => {
      const anonymized = anonymizeObjectSchema(obj, {
        preserveStandardObjects: true,
        preserveStandardFields: true,
        includeFieldTypes: true,
        includeValidationRules: true,
        seedValue: 'ai-analysis'
      });
      
      // Track anonymization mapping for reference
      anonymizationMap.set(anonymized.name, obj.name);
      
      return {
        object: anonymized,
        summary: createAnonymizationSummary(obj, anonymized)
      };
    });
    
    const summary = {
      totalObjects: objects.length,
      objectSummaries: anonymizedObjects.map(item => item.summary),
      anonymizedSchemas: anonymizedObjects.map(item => item.object),
      generatedAt: new Date().toISOString(),
      preservationNote: 'Sensitive data anonymized while preserving structural relationships and validation logic'
    };
    
    return { summary, anonymizationMap };
  }

  /**
   * Cache management
   */
  private setCache(key: string, data: any, ttl: number = this.DEFAULT_CACHE_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: new Date(),
      ttl
    });
  }

  private getFromCache(key: string): any {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    
    const now = new Date().getTime();
    const expiry = entry.timestamp.getTime() + entry.ttl;
    
    if (now > expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private cleanupCache(): void {
    const now = new Date().getTime();
    let cleanedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      const expiry = entry.timestamp.getTime() + entry.ttl;
      if (now > expiry) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    memoryUsage: number;
    hitRate: number;
  } {
    // This is a simplified implementation
    // In production, you'd want more sophisticated metrics
    return {
      totalEntries: this.cache.size,
      memoryUsage: 0, // Would need proper memory calculation
      hitRate: 0 // Would need hit/miss tracking
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }

  /**
   * Cleanup resources (for testing)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clearCache();
  }
}