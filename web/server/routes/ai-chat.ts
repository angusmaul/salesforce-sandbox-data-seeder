import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { AIService, AIServiceConfig } from '../services/ai-service';
import { APIResponse, ClaudeRequest, ClaudeResponse, StreamingChatRequest, StreamingChatResponse, ChatMessage } from '../../shared/types/api';

const router = express.Router();

// Initialize AI service with configuration from environment variables
const aiServiceConfig: AIServiceConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
  maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '1000'),
  temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.7'),
  requestTimeout: parseInt(process.env.CLAUDE_REQUEST_TIMEOUT || '30000'),
  maxRetries: parseInt(process.env.CLAUDE_MAX_RETRIES || '3'),
  retryDelayMs: parseInt(process.env.CLAUDE_RETRY_DELAY_MS || '1000'),
  rateLimitRpm: parseInt(process.env.CLAUDE_RATE_LIMIT_RPM || '60'),
  usageTrackingEnabled: process.env.CLAUDE_USAGE_TRACKING_ENABLED !== 'false'
};

let aiService: AIService | null = null;

// Initialize AI service if API key is available
if (aiServiceConfig.apiKey) {
  try {
    aiService = new AIService(aiServiceConfig);
    
    // Set up event listeners for monitoring
    aiService.on('error', (error) => {
      console.error('AI Service Error:', error);
    });
    
    aiService.on('usage', (usage) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('AI Usage:', usage);
      }
    });
    
    aiService.on('rateLimitHit', (event) => {
      console.warn(`Rate limit hit on attempt ${event.attempt}:`, event.error.message);
    });
    
    aiService.on('healthCheck', (status) => {
      if (status.status !== 'healthy') {
        console.warn('AI Service Health Check Failed:', status);
      }
    });
    
    console.log('✅ AI Service initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize AI Service:', error);
  }
} else {
  console.warn('⚠️  Claude API key not configured. AI features will be disabled.');
}

// Rate limiting specifically for AI endpoints
const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // More restrictive for AI endpoints
  message: {
    error: 'Too many AI requests. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware to check AI service availability
const requireAIService = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!aiService) {
    return res.status(503).json({
      success: false,
      error: 'AI service is not available. Please check your Claude API configuration.',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

/**
 * Enhanced chat endpoint with comprehensive error handling
 */
router.post('/chat/:sessionId', aiRateLimit, requireAIService, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, context }: ClaudeRequest = req.body;
    
    // Validate session
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    // Build enhanced context
    const enhancedContext = {
      session: {
        id: session.id,
        currentStep: session.currentStep,
        discoveredObjectsCount: session.discoveredObjects?.length || 0,
        selectedObjectsCount: session.selectedObjects?.length || 0,
        connectionInfo: session.connectionInfo ? {
          instanceUrl: session.connectionInfo.instanceUrl,
          organizationName: session.connectionInfo.organizationName,
          isSandbox: session.connectionInfo.isSandbox
        } : null
      },
      user: context || {}
    };

    // Call AI service
    const response = await aiService!.chat(message, enhancedContext);
    
    // Parse response for structured data
    const parsedResponse = parseAIResponse(response, context);
    
    const apiResponse: APIResponse<ClaudeResponse> = {
      success: true,
      data: parsedResponse,
      timestamp: new Date().toISOString()
    };
    
    res.json(apiResponse);
  } catch (error) {
    console.error('AI Chat error:', error);
    
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process chat request',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Natural language processing endpoint
 */
router.post('/process/:sessionId', aiRateLimit, requireAIService, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userInput } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!userInput || typeof userInput !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User input is required',
        timestamp: new Date().toISOString()
      });
    }

    const actionPlan = await aiService!.processNaturalLanguageRequest(userInput, session);
    
    const response: APIResponse = {
      success: true,
      data: actionPlan,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Natural language processing error:', error);
    
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process natural language request',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Schema analysis endpoint
 */
router.post('/analyze-schema/:sessionId', aiRateLimit, requireAIService, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { schemaData } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!schemaData) {
      return res.status(400).json({
        success: false,
        error: 'Schema data is required',
        timestamp: new Date().toISOString()
      });
    }

    const analysis = await aiService!.analyzeSchema(schemaData);
    
    const response: APIResponse = {
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Schema analysis error:', error);
    
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze schema',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Field suggestions endpoint
 */
router.post('/suggest-fields/:sessionId', aiRateLimit, requireAIService, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { objectType, fieldType, context } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!objectType || !fieldType) {
      return res.status(400).json({
        success: false,
        error: 'Object type and field type are required',
        timestamp: new Date().toISOString()
      });
    }

    const suggestions = await aiService!.generateFieldSuggestions(objectType, fieldType, context);
    
    const response: APIResponse = {
      success: true,
      data: { suggestions },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Field suggestions error:', error);
    
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate field suggestions',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Data validation endpoint
 */
router.post('/validate-data/:sessionId', aiRateLimit, requireAIService, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data, validationRules } = req.body;
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!data || !validationRules) {
      return res.status(400).json({
        success: false,
        error: 'Data and validation rules are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await aiService!.validateDataPattern(data, validationRules);
    
    const response: APIResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Data validation error:', error);
    
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate data',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * AI service health check
 */
router.get('/health', async (req, res) => {
  try {
    if (!aiService) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'AI service is not configured',
        timestamp: new Date().toISOString()
      });
    }

    const health = await aiService.checkHealth();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 206 : 503;

    res.status(statusCode).json({
      ...health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * AI service usage statistics
 */
router.get('/stats', requireAIService, (req, res) => {
  try {
    const stats = aiService!.getUsageStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get usage statistics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Reset usage statistics (admin endpoint)
 */
router.post('/stats/reset', requireAIService, (req, res) => {
  try {
    aiService!.resetUsageStats();
    
    res.json({
      success: true,
      message: 'Usage statistics reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset usage statistics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Streaming chat endpoint with real-time WebSocket responses
 */
router.post('/stream/:sessionId', aiRateLimit, requireAIService, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, context }: StreamingChatRequest = req.body;
    
    // Validate session
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    // Get socket service from request (should be attached by middleware)
    const socketService = req.socketService;
    if (!socketService) {
      return res.status(500).json({
        success: false,
        error: 'Socket service not available',
        timestamp: new Date().toISOString()
      });
    }

    const messageId = uuidv4();
    const startTime = Date.now();
    
    // Send typing indicator
    socketService.sendTypingIndicator(sessionId, true);
    
    // Respond immediately that streaming has started
    res.json({
      success: true,
      data: {
        messageId,
        sessionId,
        streaming: true,
        message: 'Streaming response started'
      },
      timestamp: new Date().toISOString()
    });

    try {
      // Build enhanced context
      const enhancedContext = {
        session: {
          id: session.id,
          currentStep: session.currentStep,
          discoveredObjectsCount: session.discoveredObjects?.length || 0,
          selectedObjectsCount: session.selectedObjects?.length || 0,
          connectionInfo: session.connectionInfo ? {
            instanceUrl: session.connectionInfo.instanceUrl,
            organizationName: session.connectionInfo.organizationName,
            isSandbox: session.connectionInfo.isSandbox
          } : null
        },
        user: context || {}
      };

      // Check if this is a configuration request
      let response: string;
      let parsedResponse: any;
      let configurationActions: any[] = [];

      if (isConfigurationRequest(message)) {
        // Use conversational config service
        try {
          const configResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/conversational-config/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              userInput: message,
              conversationHistory: [] // TODO: Get from session context
            })
          });

          if (configResponse.ok) {
            const configResult = await configResponse.json();
            if (configResult.success) {
              response = configResult.data.message;
              configurationActions = configResult.data.actions || [];
              parsedResponse = {
                suggestions: [],
                actions: configurationActions
              };
            } else {
              // Fallback to regular AI response
              response = await aiService!.chat(message, enhancedContext);
              parsedResponse = parseAIResponse(response, context);
            }
          } else {
            // Fallback to regular AI response
            response = await aiService!.chat(message, enhancedContext);
            parsedResponse = parseAIResponse(response, context);
          }
        } catch (error) {
          console.error('Conversational config error:', error);
          // Fallback to regular AI response
          response = await aiService!.chat(message, enhancedContext);
          parsedResponse = parseAIResponse(response, context);
        }
      } else {
        // Regular AI response
        response = await aiService!.chat(message, enhancedContext);
        parsedResponse = parseAIResponse(response, context);
      }
      
      const responseTime = Date.now() - startTime;
      
      // Simulate streaming by breaking response into chunks
      const words = response.split(' ');
      const chunkSize = Math.max(1, Math.floor(words.length / 10)); // 10 chunks
      let accumulatedContent = '';
      
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        accumulatedContent += (i > 0 ? ' ' : '') + chunk;
        
        const isComplete = i + chunkSize >= words.length;
        
        const streamingResponse: StreamingChatResponse = {
          messageId,
          sessionId,
          content: accumulatedContent,
          isComplete,
          timestamp: new Date().toISOString(),
          metadata: isComplete ? {
            tokens: Math.ceil(response.length / 4), // Rough token estimate
            responseTime,
            suggestions: parsedResponse.suggestions,
            actions: parsedResponse.actions
          } : undefined
        };
        
        socketService.sendChatMessageChunk(sessionId, streamingResponse);
        
        // Add small delay between chunks for realistic streaming effect
        if (!isComplete) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Send final message for persistence
      const finalMessage: ChatMessage = {
        id: messageId,
        sessionId,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        metadata: {
          tokens: Math.ceil(response.length / 4),
          responseTime,
          suggestions: parsedResponse.suggestions,
          actions: parsedResponse.actions
        }
      };
      
      socketService.sendChatMessage(sessionId, finalMessage);
      
    } catch (error) {
      console.error('Streaming chat error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to process chat request';
      
      // Send error through socket
      socketService.sendChatError(sessionId, messageId, errorMessage);
      
      // Send error message as final response
      const errorChatMessage: ChatMessage = {
        id: messageId,
        sessionId,
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${errorMessage}`,
        timestamp: new Date(),
        metadata: {
          error: errorMessage,
          responseTime: Date.now() - startTime
        }
      };
      
      socketService.sendChatMessage(sessionId, errorChatMessage);
    } finally {
      // Always stop typing indicator
      socketService.sendTypingIndicator(sessionId, false);
    }
    
  } catch (error) {
    console.error('Streaming chat setup error:', error);
    
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to setup streaming chat',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Helper functions

// Check if the message is a configuration request
function isConfigurationRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Configuration keywords
  const configKeywords = [
    'configure', 'config', 'set up', 'setup', 'create', 'generate',
    'records', 'accounts', 'contacts', 'opportunities', 'leads',
    'objects', 'data', 'how many', 'count', 'number of'
  ];
  
  // Navigation keywords
  const navKeywords = [
    'navigate', 'go to', 'move to', 'step', 'next step', 'previous step'
  ];
  
  // Check for configuration or navigation intents
  const hasConfigKeyword = configKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasNavKeyword = navKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasNumbers = /\d+/.test(message);
  
  return hasConfigKeyword || hasNavKeyword || (hasNumbers && lowerMessage.includes('record'));
}

function parseAIResponse(response: string, context?: any): ClaudeResponse {
  // Enhanced response parsing
  const lines = response.split('\n');
  const suggestions: string[] = [];
  const actions: any[] = [];
  
  // Look for structured suggestions
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.match(/^[-*•]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      suggestions.push(trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, ''));
    }
  });
  
  // Look for actionable content
  if (response.toLowerCase().includes('click') || response.toLowerCase().includes('navigate')) {
    actions.push({
      type: 'navigate',
      label: 'Follow suggested steps',
      data: {}
    });
  }
  
  if (response.toLowerCase().includes('configure') || response.toLowerCase().includes('set')) {
    actions.push({
      type: 'configure',
      label: 'Apply configuration',
      data: {}
    });
  }
  
  if (response.toLowerCase().includes('try again') || response.toLowerCase().includes('retry')) {
    actions.push({
      type: 'retry',
      label: 'Retry the operation',
      data: {}
    });
  }
  
  return {
    message: response,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    actions: actions.length > 0 ? actions : undefined
  };
}

export default router;