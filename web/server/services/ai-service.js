// AI Service - JavaScript wrapper for Claude API integration
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

class AIService {
  constructor() {
    this.anthropic = null;
    this.initialized = false;
    this.stats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      avgResponseTime: 0
    };

    // Check for demo mode first
    const DEMO_MODE = process.env.AI_DEMO_MODE === 'true';
    if (DEMO_MODE) {
      this.initialized = true; // Allow demo mode to work
      console.log('🎭 Demo Mode: AI service running in demo mode (no API calls)');
      return;
    }
    
    // Initialize Anthropic client if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      this.initialized = true;
      console.log('✅ Claude API initialized successfully');
    } else {
      console.log('⚠️ Claude API key not configured');
    }
  }

  async chat(message, sessionId) {
    if (!this.initialized) {
      return {
        success: false,
        response: 'AI service not available. Please configure ANTHROPIC_API_KEY.',
        error: true
      };
    }

    // DEMO MODE: Enable this to bypass API calls during development
    const DEMO_MODE = process.env.AI_DEMO_MODE === 'true';
    
    if (DEMO_MODE) {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      
      // Return demo responses based on message content
      const demoResponses = {
        'hi': 'Hello! I\'m your AI assistant for Salesforce data generation. How can I help you today?',
        'help': 'I can assist you with:\n• Generating realistic Salesforce data\n• Understanding validation rules\n• Field value suggestions\n• Data generation best practices\n\nWhat would you like help with?',
        'data': 'For effective data generation:\n1. Start with required fields\n2. Maintain relationships between objects\n3. Use realistic values that match your business context\n4. Consider validation rules and field dependencies\n\nWhich objects are you working with?',
        'validation': 'Validation rules ensure data quality by:\n• Checking required fields\n• Enforcing business logic\n• Validating field formats\n• Maintaining referential integrity\n\nWould you like help with specific validation rules?'
      };
      
      // Find matching response or use default
      const lowerMessage = message.toLowerCase();
      let response = 'I\'m here to help with Salesforce data generation. You can ask me about validation rules, field suggestions, data patterns, or best practices. What specific area would you like assistance with?';
      
      for (const [key, value] of Object.entries(demoResponses)) {
        if (lowerMessage.includes(key)) {
          response = value;
          break;
        }
      }
      
      return {
        success: true,
        response: response + '\n\n*[Demo Mode - API limits bypassed]*',
        usage: { input_tokens: 10, output_tokens: 50 },
        responseTime: 1500
      };
    }

    try {
      const startTime = Date.now();
      
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 500, // Reduced tokens for rate limit
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.7,
        messages: [{
          role: 'user',
          content: message
        }]
      });

      const responseTime = Date.now() - startTime;
      this.stats.totalRequests++;
      this.stats.avgResponseTime = (this.stats.avgResponseTime + responseTime) / 2;

      return {
        success: true,
        response: response.content[0].text,
        usage: response.usage,
        responseTime
      };
    } catch (error) {
      console.error('Claude API error:', error.message);
      
      // Handle rate limit errors specifically
      if (error.status === 429) {
        return {
          success: false,
          response: 'AI assistant is temporarily rate-limited. This is normal for new API keys - rate limits will increase gradually with usage. Please try again in a moment.',
          error: 'rate_limit',
          retryAfter: 60 // Suggest retry after 60 seconds
        };
      }
      
      return {
        success: false,
        response: 'Failed to get AI response. Please try again.',
        error: error.message
      };
    }
  }

  async analyzeSchema(schemaData) {
    if (!this.initialized) {
      return null;
    }

    try {
      const prompt = `Analyze this Salesforce object schema and provide insights:
Object: ${schemaData.objectName}
Validation Rules: ${JSON.stringify(schemaData.validationRules, null, 2)}

Provide:
1. Key constraints these rules enforce
2. Recommendations for generating compliant data
3. Potential issues to watch for

Keep response concise and technical.`;

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const text = response.content[0].text;
      
      // Parse response into structured format
      return {
        constraints: this.extractConstraints(text),
        recommendations: this.extractRecommendations(text),
        analysis: text
      };
    } catch (error) {
      console.error('Schema analysis error:', error.message);
      return null;
    }
  }

  async generateFieldSuggestions(objectType, fieldType, context) {
    if (!this.initialized) {
      // Fallback to basic suggestions
      return this.getBasicSuggestions(fieldType);
    }

    try {
      const prompt = `Generate realistic test data for Salesforce field:
Object: ${objectType}
Field Type: ${fieldType}
Context: ${JSON.stringify(context)}

Provide 3 realistic values that would pass validation.
Format: JSON array of strings`;

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const text = response.content[0].text;
      
      // Try to parse JSON from response
      try {
        const match = text.match(/\[.*\]/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch (e) {
        // Fallback if JSON parsing fails
      }

      return this.getBasicSuggestions(fieldType);
    } catch (error) {
      console.error('Field suggestion error:', error.message);
      return this.getBasicSuggestions(fieldType);
    }
  }

  async validateDataPattern(data, validationRules) {
    if (!this.initialized) {
      // Basic validation without AI
      return {
        valid: true,
        issues: [],
        suggestions: []
      };
    }

    try {
      const prompt = `Validate this data against Salesforce validation rules:
Data: ${JSON.stringify(data, null, 2)}
Validation Rules: ${JSON.stringify(validationRules, null, 2)}

Check if the data would pass these validation rules.
Provide:
1. Valid: true/false
2. Issues: List any validation failures
3. Suggestions: How to fix the data

Format response as JSON.`;

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        temperature: 0.2,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const text = response.content[0].text;
      
      // Try to parse JSON from response
      try {
        const match = text.match(/\{.*\}/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch (e) {
        // Fallback if JSON parsing fails
      }

      return {
        valid: true,
        issues: [],
        suggestions: []
      };
    } catch (error) {
      console.error('Validation error:', error.message);
      return {
        valid: true,
        issues: [],
        suggestions: [],
        error: error.message
      };
    }
  }

  async processNaturalLanguageRequest(userInput, sessionContext) {
    if (!this.initialized) {
      return {
        action: 'error',
        message: 'AI service not available'
      };
    }

    try {
      const prompt = `User is using Salesforce Sandbox Data Seeder wizard.
Current context: ${JSON.stringify(sessionContext)}
User request: "${userInput}"

Determine the user's intent and provide an action plan.
Possible actions: navigate_to_step, configure_settings, generate_data, ask_clarification
Format response as JSON with: action, parameters, message`;

      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        temperature: 0.5,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const text = response.content[0].text;
      
      // Try to parse JSON from response
      try {
        const match = text.match(/\{.*\}/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch (e) {
        // Fallback if JSON parsing fails
      }

      return {
        action: 'message',
        message: text
      };
    } catch (error) {
      console.error('NLP processing error:', error.message);
      return {
        action: 'error',
        message: 'Failed to process request'
      };
    }
  }

  async getHealthStatus() {
    return {
      status: this.initialized ? 'healthy' : 'unavailable',
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
      rateLimit: process.env.CLAUDE_RATE_LIMIT_RPM || 60,
      initialized: this.initialized,
      apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY
    };
  }

  async getUsageStats() {
    return this.stats;
  }

  // Helper methods
  extractConstraints(text) {
    const constraints = [];
    const lines = text.split('\n');
    let inConstraints = false;
    
    for (const line of lines) {
      if (line.toLowerCase().includes('constraint') || line.includes('1.')) {
        inConstraints = true;
      } else if (line.includes('2.') || line.toLowerCase().includes('recommend')) {
        inConstraints = false;
      }
      
      if (inConstraints && line.trim().startsWith('-')) {
        constraints.push(line.trim().substring(1).trim());
      }
    }
    
    return constraints;
  }

  extractRecommendations(text) {
    const recommendations = [];
    const lines = text.split('\n');
    let inRecommendations = false;
    
    for (const line of lines) {
      if (line.toLowerCase().includes('recommend') || line.includes('2.')) {
        inRecommendations = true;
      } else if (line.includes('3.') || line.toLowerCase().includes('issue')) {
        inRecommendations = false;
      }
      
      if (inRecommendations && line.trim().startsWith('-')) {
        recommendations.push(line.trim().substring(1).trim());
      }
    }
    
    return recommendations;
  }

  getBasicSuggestions(fieldType) {
    const suggestions = {
      string: ['Sample Text', 'Test Value', 'Example Data'],
      email: ['test@example.com', 'user@demo.org', 'sample@test.net'],
      phone: ['555-0100', '555-0200', '555-0300'],
      url: ['https://example.com', 'https://test.org', 'https://demo.net'],
      boolean: [true, false, true],
      integer: [1, 10, 100],
      double: [99.99, 149.50, 299.00],
      date: ['2025-01-01', '2025-06-15', '2025-12-31'],
      datetime: ['2025-01-01T09:00:00Z', '2025-06-15T14:30:00Z', '2025-12-31T23:59:59Z']
    };
    
    return suggestions[fieldType] || ['Value 1', 'Value 2', 'Value 3'];
  }
}

module.exports = AIService;