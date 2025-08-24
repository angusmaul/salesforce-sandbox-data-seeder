// AI Service - JavaScript wrapper for Claude API integration
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

// Singleton instance
let aiServiceInstance = null;

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
    this.rateLimits = {
      requestsPerMinute: null,
      requestsPerDay: null,
      tokensPerMinute: null,
      tokensPerDay: null,
      remaining: {},
      resets: {},
      lastUpdated: null
    };
    this.usageHistory = [];

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
      
      // Reduce message size to avoid acceleration limits
      // Trim the message to essential content only
      const trimmedMessage = this.trimMessage(message);
      
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 100, // Significantly reduced for acceleration limit
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.7,
        messages: [{
          role: 'user',
          content: trimmedMessage
        }]
      });

      const responseTime = Date.now() - startTime;
      this.stats.totalRequests++;
      this.stats.avgResponseTime = (this.stats.avgResponseTime + responseTime) / 2;
      
      // Track token usage
      if (response.usage) {
        this.stats.totalTokens += (response.usage.input_tokens + response.usage.output_tokens);
        
        // Store usage history
        this.usageHistory.push({
          timestamp: new Date().toISOString(),
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          responseTime
        });
        
        // Keep only last 100 requests in history
        if (this.usageHistory.length > 100) {
          this.usageHistory.shift();
        }
      }

      return {
        success: true,
        response: response.content[0].text,
        usage: response.usage,
        responseTime
      };
    } catch (error) {
      console.error('Claude API error:', error.status, JSON.stringify(error.error || error.message));
      
      // Handle rate limit errors specifically
      if (error.status === 429) {
        // Check if it's acceleration limit
        const errorMessage = error.error?.error?.message || error.message || '';
        if (errorMessage.includes('acceleration') || errorMessage.includes('usage increase rate')) {
          return {
            success: false,
            response: 'Your API key is experiencing usage acceleration limits. This is normal for new keys. The system will gradually increase your allowed usage. Please wait 2 minutes before trying again.',
            error: 'acceleration_limit',
            retryAfter: 120 // 2 minutes for acceleration limits
          };
        }
        
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
  
  // Helper method to trim messages to reduce token usage
  trimMessage(message) {
    // Remove excess whitespace and limit message length
    const cleaned = message.replace(/\s+/g, ' ').trim();
    
    // Extract only the user's actual question, removing context if too long
    const lines = cleaned.split('\n');
    const userMessageStart = lines.findIndex(line => line.includes('User message:'));
    
    if (userMessageStart !== -1 && userMessageStart < lines.length - 1) {
      // Get just the user's message part
      const userPart = lines.slice(userMessageStart).join(' ');
      const actualMessage = userPart.replace('User message:', '').trim();
      
      // Create minimal context
      return `Salesforce data generation assistant. User asks: ${actualMessage.substring(0, 200)}`;
    }
    
    // Fallback: just truncate to reasonable length
    return cleaned.substring(0, 300);
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
      apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
      rateLimits: this.rateLimits,
      currentUsage: this.getRateLimitInfo()
    };
  }
  
  getRateLimitInfo() {
    // Calculate current usage rate
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;
    
    const recentRequests = this.usageHistory.filter(h => 
      new Date(h.timestamp).getTime() > oneMinuteAgo
    );
    
    const dailyRequests = this.usageHistory.filter(h => 
      new Date(h.timestamp).getTime() > oneDayAgo
    );
    
    const recentTokens = recentRequests.reduce((sum, r) => sum + r.totalTokens, 0);
    const dailyTokens = dailyRequests.reduce((sum, r) => sum + r.totalTokens, 0);
    
    return {
      current: {
        requestsPerMinute: recentRequests.length,
        tokensPerMinute: recentTokens,
        requestsPerDay: dailyRequests.length,
        tokensPerDay: dailyTokens
      },
      limits: this.rateLimits,
      stats: this.stats,
      recentHistory: this.usageHistory.slice(-10), // Last 10 requests
      recommendations: this.getRateLimitRecommendations(recentTokens)
    };
  }
  
  getRateLimitRecommendations(recentTokens) {
    const recommendations = [];
    
    if (recentTokens > 1000) {
      recommendations.push('High token usage detected. Consider reducing message length.');
    }
    
    if (this.usageHistory.length > 0) {
      const lastRequest = this.usageHistory[this.usageHistory.length - 1];
      if (lastRequest.inputTokens > 500) {
        recommendations.push('Input tokens are high. The trimMessage function should help reduce this.');
      }
    }
    
    if (this.stats.totalRequests < 10) {
      recommendations.push('New API key detected. Acceleration limits will ease after gradual usage over 2-3 days.');
    }
    
    return recommendations;
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

  // Static method to get singleton instance
  static getInstance() {
    if (!aiServiceInstance) {
      aiServiceInstance = new AIService();
    }
    return aiServiceInstance;
  }
}

module.exports = AIService;