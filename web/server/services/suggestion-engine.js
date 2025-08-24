/**
 * Suggestion Engine - AI-powered field value suggestions for Salesforce data generation
 * Leverages Claude API integration for intelligent, context-aware data recommendations
 */

const AIService = require('./ai-service.js');

class SuggestionEngine {
  constructor() {
    this.aiService = AIService.getInstance();
    this.metrics = this.initializeMetrics();
    this.businessScenarios = this.initializeBusinessScenarios();
    this.industryPatterns = this.initializeIndustryPatterns();
    this.suggestionCache = new Map();
  }

  /**
   * Generate AI-powered field suggestions based on context
   */
  async generateFieldSuggestions(request) {
    const cacheKey = this.generateCacheKey(request);
    
    // Check cache first for performance
    if (this.suggestionCache.has(cacheKey)) {
      return this.suggestionCache.get(cacheKey);
    }

    try {
      // Generate context-aware suggestions using AI
      const suggestions = await this.generateAISuggestions(request);
      
      // Enhance with business logic and validation
      const enhancedSuggestions = await this.enhanceSuggestions(suggestions, request);
      
      // Cache results
      this.suggestionCache.set(cacheKey, enhancedSuggestions);
      
      // Update metrics
      this.updateMetrics('generated', enhancedSuggestions.length, request);
      
      return enhancedSuggestions;
    } catch (error) {
      console.error('Error generating field suggestions:', error);
      
      // Fallback to rule-based suggestions
      return this.generateFallbackSuggestions(request);
    }
  }

  /**
   * Generate suggestions using Claude API
   */
  async generateAISuggestions(request) {
    const prompt = this.buildSuggestionPrompt(request);
    
    const aiResponse = await this.aiService.chat(prompt, `suggestion_${Date.now()}`);
    
    if (!aiResponse.success) {
      throw new Error(`AI service error: ${aiResponse.error}`);
    }
    
    return this.parseAISuggestionResponse(aiResponse.response, request);
  }

  /**
   * Build contextual prompt for AI suggestions
   */
  buildSuggestionPrompt(request) {
    const {
      objectName,
      fieldName,
      fieldType,
      fieldMetadata,
      businessContext,
      relationshipContext,
      validationRules,
      recordIndex = 0
    } = request;

    let prompt = `Generate realistic Salesforce field suggestions for:

Object: ${objectName}
Field: ${fieldName} (${fieldType})
Record Index: ${recordIndex + 1}`;

    // Add field metadata context
    if (fieldMetadata) {
      prompt += `\nField Details:`;
      if (fieldMetadata.length) prompt += `\n- Max Length: ${fieldMetadata.length}`;
      if (fieldMetadata.precision) prompt += `\n- Precision: ${fieldMetadata.precision}`;
      if (fieldMetadata.scale) prompt += `\n- Scale: ${fieldMetadata.scale}`;
      if (fieldMetadata.picklistValues?.length > 0) {
        prompt += `\n- Picklist Options: ${fieldMetadata.picklistValues.slice(0, 5).map((p) => p.value).join(', ')}${fieldMetadata.picklistValues.length > 5 ? '...' : ''}`;
      }
    }

    // Add business context
    if (businessContext) {
      prompt += `\nBusiness Context:`;
      if (businessContext.industry) prompt += `\n- Industry: ${businessContext.industry}`;
      if (businessContext.scenario) prompt += `\n- Scenario: ${businessContext.scenario}`;
      if (businessContext.companySize) prompt += `\n- Company Size: ${businessContext.companySize}`;
      if (businessContext.region) prompt += `\n- Region: ${businessContext.region}`;
    }

    // Add relationship context
    if (relationshipContext?.parentRecords?.length > 0) {
      prompt += `\nRelated Data:`;
      relationshipContext.parentRecords.forEach(parent => {
        prompt += `\n- ${parent.objectName}: ${JSON.stringify(parent.recordData, null, 0).substring(0, 100)}`;
      });
    }

    if (relationshipContext?.relatedFields?.length > 0) {
      prompt += `\nRelated Fields in Record:`;
      relationshipContext.relatedFields.forEach(field => {
        prompt += `\n- ${field.fieldName}: ${field.value}`;
      });
    }

    // Add validation rules context
    if (validationRules?.length > 0) {
      prompt += `\nValidation Rules:`;
      validationRules.slice(0, 3).forEach(rule => {
        prompt += `\n- ${rule.validationName || 'Rule'}: ${rule.errorConditionFormula || rule.description}`;
      });
    }

    prompt += `\n\nProvide 3 realistic suggestions that:
1. Match the business context and industry patterns
2. Create logical relationships with existing data
3. Pass validation rules
4. Vary appropriately based on record index for realistic distribution

Format as JSON array with objects containing:
- value: the suggested field value
- confidence: number 0-1 indicating confidence level
- reasoning: brief explanation of why this suggestion fits
- businessContext: what business scenario this represents`;

    return prompt;
  }

  /**
   * Parse AI response into structured suggestions
   */
  parseAISuggestionResponse(response, request) {
    try {
      // Extract JSON from AI response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in AI response');
      }

      const suggestions = JSON.parse(jsonMatch[0]);
      
      return suggestions.map((suggestion) => ({
        value: this.validateAndFormatValue(suggestion.value, request.fieldType, request.fieldMetadata),
        confidence: Math.min(Math.max(suggestion.confidence || 0.7, 0), 1),
        reasoning: suggestion.reasoning || 'AI-generated suggestion',
        businessContext: suggestion.businessContext || request.businessContext?.scenario,
        industry: request.businessContext?.industry
      }));
    } catch (error) {
      console.error('Error parsing AI suggestion response:', error);
      
      // Extract meaningful suggestions from text if JSON parsing fails
      return this.extractSuggestionsFromText(response, request);
    }
  }

  /**
   * Extract suggestions from text when JSON parsing fails
   */
  extractSuggestionsFromText(response, request) {
    const suggestions = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      // Look for patterns like "1. Value" or "- Value" 
      const match = line.match(/^[\d\-\*]\s*\.?\s*(.+)$/);
      if (match && suggestions.length < 3) {
        const value = this.validateAndFormatValue(match[1].trim(), request.fieldType, request.fieldMetadata);
        if (value !== null) {
          suggestions.push({
            value,
            confidence: 0.6, // Lower confidence for text extraction
            reasoning: 'Extracted from AI text response',
            businessContext: request.businessContext?.scenario
          });
        }
      }
    }
    
    return suggestions.length > 0 ? suggestions : this.generateFallbackSuggestions(request);
  }

  /**
   * Validate and format field values according to Salesforce types
   */
  validateAndFormatValue(value, fieldType, fieldMetadata) {
    try {
      switch (fieldType.toLowerCase()) {
        case 'string':
        case 'textarea':
          const strValue = String(value);
          const maxLength = fieldMetadata?.length || 255;
          return strValue.length > maxLength ? strValue.substring(0, maxLength) : strValue;
          
        case 'email':
          const emailValue = String(value);
          // Basic email validation
          return emailValue.includes('@') ? emailValue : `${emailValue}@example.com`;
          
        case 'phone':
          const phoneValue = String(value).replace(/[^\d\-\+\(\)\s]/g, '');
          return phoneValue || '555-0100';
          
        case 'url':
          const urlValue = String(value);
          return urlValue.startsWith('http') ? urlValue : `https://${urlValue}`;
          
        case 'boolean':
          return Boolean(value);
          
        case 'date':
          const date = new Date(value);
          return isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0];
          
        case 'datetime':
          const datetime = new Date(value);
          return isNaN(datetime.getTime()) ? new Date().toISOString() : datetime.toISOString();
          
        case 'currency':
        case 'double':
        case 'percent':
          const numValue = parseFloat(String(value).replace(/[^\d\.\-]/g, ''));
          return isNaN(numValue) ? 0 : numValue;
          
        case 'int':
          const intValue = parseInt(String(value).replace(/[^\d\-]/g, ''));
          return isNaN(intValue) ? 0 : intValue;
          
        case 'picklist':
          if (fieldMetadata?.picklistValues?.length > 0) {
            const picklistValue = String(value);
            const validOption = fieldMetadata.picklistValues.find((p) => 
              p.value.toLowerCase() === picklistValue.toLowerCase()
            );
            return validOption ? validOption.value : fieldMetadata.picklistValues[0].value;
          }
          return String(value);
          
        default:
          return String(value);
      }
    } catch (error) {
      console.error('Error validating field value:', error);
      return value;
    }
  }

  /**
   * Enhance suggestions with business logic
   */
  async enhanceSuggestions(suggestions, request) {
    // Apply industry-specific enhancements
    if (request.businessContext?.industry) {
      suggestions = this.applyIndustryPatterns(suggestions, request);
    }
    
    // Apply relationship-aware enhancements
    if (request.relationshipContext) {
      suggestions = this.applyRelationshipLogic(suggestions, request);
    }
    
    // Sort by confidence and business relevance
    return suggestions.sort((a, b) => {
      // Prioritize high confidence + business context relevance
      const scoreA = a.confidence * (a.businessContext ? 1.2 : 1.0);
      const scoreB = b.confidence * (b.businessContext ? 1.2 : 1.0);
      return scoreB - scoreA;
    });
  }

  /**
   * Apply industry-specific patterns to suggestions
   */
  applyIndustryPatterns(suggestions, request) {
    const industry = request.businessContext?.industry;
    if (!industry || !this.industryPatterns[industry]) {
      return suggestions;
    }

    const patterns = this.industryPatterns[industry];
    const objectPatterns = patterns[request.objectName];
    const fieldPatterns = objectPatterns?.[request.fieldName];

    if (fieldPatterns) {
      // Boost confidence for suggestions matching industry patterns
      suggestions.forEach(suggestion => {
        if (this.matchesIndustryPattern(suggestion.value, fieldPatterns)) {
          suggestion.confidence = Math.min(suggestion.confidence * 1.15, 1.0);
          suggestion.reasoning += ` (${industry} industry pattern)`;
        }
      });
    }

    return suggestions;
  }

  /**
   * Apply relationship logic to create coherent data
   */
  applyRelationshipLogic(suggestions, request) {
    const context = request.relationshipContext;
    if (!context) return suggestions;

    // Example: If Contact.Account is already set, suggest Contact.Email that matches the Account domain
    if (request.objectName === 'Contact' && request.fieldName === 'Email') {
      const accountRecord = context.parentRecords?.find(p => p.objectName === 'Account');
      const accountWebsite = accountRecord?.recordData?.Website;
      
      if (accountWebsite) {
        const domain = accountWebsite.replace(/https?:\/\//, '').replace(/www\./, '');
        suggestions.forEach(suggestion => {
          if (typeof suggestion.value === 'string' && suggestion.value.includes('@')) {
            const [localPart] = suggestion.value.split('@');
            suggestion.value = `${localPart}@${domain}`;
            suggestion.confidence = Math.min(suggestion.confidence * 1.2, 1.0);
            suggestion.reasoning += ' (matches Account domain)';
          }
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate fallback suggestions when AI is unavailable
   */
  generateFallbackSuggestions(request) {
    const { fieldType, fieldName, businessContext } = request;
    const suggestions = [];

    // Use existing AI service fallback logic
    const basicValues = this.aiService.getBasicSuggestions(fieldType);
    
    basicValues.forEach((value, index) => {
      suggestions.push({
        value,
        confidence: 0.5 - (index * 0.1), // Decreasing confidence
        reasoning: `Rule-based ${fieldType} suggestion`,
        businessContext: businessContext?.scenario
      });
    });

    return suggestions;
  }

  /**
   * Record user interaction with suggestions for A/B testing
   */
  recordSuggestionInteraction(suggestionId, action, modifiedValue) {
    switch (action) {
      case 'accepted':
        this.metrics.acceptedSuggestions++;
        break;
      case 'rejected':
        this.metrics.rejectedSuggestions++;
        break;
      case 'modified':
        this.metrics.modifiedSuggestions++;
        break;
    }

    this.updateAcceptanceRate();
  }

  /**
   * Get suggestion metrics for analysis
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get business scenarios for UI selection
   */
  getBusinessScenarios() {
    return this.businessScenarios;
  }

  // Private helper methods

  generateCacheKey(request) {
    const keyData = {
      objectName: request.objectName,
      fieldName: request.fieldName,
      fieldType: request.fieldType,
      businessContext: request.businessContext,
      recordIndex: request.recordIndex
    };
    return JSON.stringify(keyData);
  }

  initializeMetrics() {
    return {
      totalSuggestions: 0,
      acceptedSuggestions: 0,
      rejectedSuggestions: 0,
      modifiedSuggestions: 0,
      acceptanceRate: 0,
      averageConfidence: 0,
      fieldTypeBreakdown: {},
      businessContextUsage: {}
    };
  }

  updateMetrics(action, count, request) {
    if (action === 'generated') {
      this.metrics.totalSuggestions += count;
      
      // Track field type usage
      if (!this.metrics.fieldTypeBreakdown[request.fieldType]) {
        this.metrics.fieldTypeBreakdown[request.fieldType] = { total: 0, accepted: 0 };
      }
      this.metrics.fieldTypeBreakdown[request.fieldType].total += count;
      
      // Track business context usage
      if (request.businessContext?.scenario) {
        this.metrics.businessContextUsage[request.businessContext.scenario] = 
          (this.metrics.businessContextUsage[request.businessContext.scenario] || 0) + 1;
      }
    }
  }

  updateAcceptanceRate() {
    const totalInteractions = this.metrics.acceptedSuggestions + this.metrics.rejectedSuggestions + this.metrics.modifiedSuggestions;
    if (totalInteractions > 0) {
      this.metrics.acceptanceRate = (this.metrics.acceptedSuggestions + this.metrics.modifiedSuggestions) / totalInteractions;
    }
  }

  initializeBusinessScenarios() {
    return [
      {
        name: 'New B2B SaaS Company',
        description: 'Startup SaaS company with SMB customers',
        industry: 'Technology',
        dataPatterns: {
          Account: {
            Name: { valueTypes: ['company'], businessRules: ['tech_focused'], relationships: ['website_domain'] },
            Type: { valueTypes: ['Customer', 'Prospect'], businessRules: ['b2b_focus'], relationships: [] }
          }
        }
      },
      {
        name: 'Manufacturing Enterprise',
        description: 'Large manufacturing company with complex supply chain',
        industry: 'Manufacturing',
        dataPatterns: {
          Account: {
            Name: { valueTypes: ['company'], businessRules: ['manufacturing'], relationships: ['location_based'] },
            Industry: { valueTypes: ['Manufacturing'], businessRules: ['industrial'], relationships: [] }
          }
        }
      },
      {
        name: 'Financial Services',
        description: 'Bank or financial institution with retail and commercial clients',
        industry: 'Financial Services',
        dataPatterns: {
          Account: {
            Name: { valueTypes: ['company', 'individual'], businessRules: ['financial'], relationships: ['compliance'] },
            Type: { valueTypes: ['Commercial', 'Retail'], businessRules: ['regulated'], relationships: [] }
          }
        }
      }
    ];
  }

  initializeIndustryPatterns() {
    return {
      'Technology': {
        Account: {
          Name: ['Tech Corp', 'Software Inc', 'Data Systems', 'Cloud Solutions'],
          Website: ['tech', 'software', 'cloud', 'data']
        }
      },
      'Manufacturing': {
        Account: {
          Name: ['Manufacturing', 'Industries', 'Corporation', 'Systems'],
          Type: ['Customer', 'Supplier', 'Partner']
        }
      },
      'Financial Services': {
        Account: {
          Name: ['Bank', 'Financial', 'Capital', 'Investment'],
          Type: ['Commercial', 'Retail', 'Institution']
        }
      }
    };
  }

  matchesIndustryPattern(value, patterns) {
    if (!patterns.valueTypes) return false;
    
    const valueStr = String(value).toLowerCase();
    return patterns.valueTypes.some((pattern) => 
      valueStr.includes(pattern.toLowerCase())
    );
  }
}

// Export singleton instance
const suggestionEngine = new SuggestionEngine();
module.exports = { suggestionEngine, SuggestionEngine };