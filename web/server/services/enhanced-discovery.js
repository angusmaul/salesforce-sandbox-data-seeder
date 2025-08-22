// Enhanced Discovery Service - JavaScript wrapper
// Extends discovery with validation rule extraction and AI analysis

class EnhancedDiscoveryService {
  constructor() {
    this.aiService = null;
    
    // Try to load AI service if available
    try {
      const AIService = require('./ai-service');
      this.aiService = new AIService();
      console.log('✅ AI Service loaded for enhanced discovery');
    } catch (error) {
      console.log('⚠️ AI Service not available for enhanced discovery');
    }
  }

  async discoverWithValidationRules(connection, objectNames) {
    // Basic discovery results
    const results = {
      objects: [],
      validationRules: {},
      timestamp: new Date().toISOString()
    };

    // For each object, get metadata including validation rules
    for (const objectName of objectNames) {
      try {
        // Get basic object metadata
        const objectMeta = {
          name: objectName,
          fields: [],
          validationRules: []
        };

        // Add to results
        results.objects.push(objectMeta);
        results.validationRules[objectName] = [];
      } catch (error) {
        console.error(`Error discovering ${objectName}:`, error.message);
      }
    }

    return results;
  }

  async extractValidationRules(connection, objectName) {
    // Placeholder for validation rule extraction
    // In a real implementation, this would use Salesforce Metadata API
    return [];
  }

  async anonymizeSchema(schemaData) {
    // Basic anonymization for AI analysis
    const anonymized = JSON.parse(JSON.stringify(schemaData));
    
    // Anonymize custom field names
    if (anonymized.fields) {
      anonymized.fields = anonymized.fields.map(field => {
        if (field.name && field.name.endsWith('__c')) {
          return {
            ...field,
            name: `CustomField_${Math.random().toString(36).substr(2, 9)}__c`,
            originalName: field.name // Keep reference for mapping back
          };
        }
        return field;
      });
    }

    return anonymized;
  }

  async analyzeWithAI(schemaData) {
    if (!this.aiService) {
      return {
        analyzed: false,
        message: 'AI service not available'
      };
    }

    try {
      const anonymized = await this.anonymizeSchema(schemaData);
      const analysis = await this.aiService.analyzeSchema(anonymized);
      
      return {
        analyzed: true,
        ...analysis
      };
    } catch (error) {
      console.error('AI analysis error:', error.message);
      return {
        analyzed: false,
        error: error.message
      };
    }
  }

  async getFieldDependencies(validationRules) {
    // Extract field dependencies from validation rules
    const dependencies = {};
    
    for (const rule of validationRules) {
      if (rule.formula) {
        // Extract field references from formula
        const fieldRefs = rule.formula.match(/\b[A-Z][a-zA-Z0-9_]*\b/g) || [];
        
        for (const field of fieldRefs) {
          if (!dependencies[field]) {
            dependencies[field] = [];
          }
          dependencies[field].push(rule.name);
        }
      }
    }

    return dependencies;
  }

  async getConstraintPatterns(validationRules) {
    // Identify common constraint patterns
    const patterns = {
      requiredFields: [],
      conditionalRequired: [],
      rangeConstraints: [],
      formatConstraints: [],
      crossFieldValidation: []
    };

    for (const rule of validationRules) {
      if (rule.formula) {
        // Check for required field patterns
        if (rule.formula.includes('ISBLANK') && rule.formula.includes('NOT')) {
          const match = rule.formula.match(/NOT\(ISBLANK\(([^)]+)\)\)/);
          if (match) {
            patterns.requiredFields.push(match[1]);
          }
        }

        // Check for range constraints
        if (rule.formula.includes('>') || rule.formula.includes('<')) {
          patterns.rangeConstraints.push({
            rule: rule.name,
            formula: rule.formula
          });
        }

        // Check for format constraints
        if (rule.formula.includes('REGEX') || rule.formula.includes('CONTAINS')) {
          patterns.formatConstraints.push({
            rule: rule.name,
            formula: rule.formula
          });
        }

        // Check for cross-field validation
        if ((rule.formula.match(/\b[A-Z][a-zA-Z0-9_]*\b/g) || []).length > 1) {
          patterns.crossFieldValidation.push({
            rule: rule.name,
            formula: rule.formula
          });
        }
      }
    }

    return patterns;
  }
}

module.exports = EnhancedDiscoveryService;