// Conversational Configuration API
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const AIService = require('../services/ai-service.js');

// Import TypeScript services (we'll need to compile or use ts-node)
let NLPProcessor, ActionTranslator;
try {
  // These will need to be compiled to JS or we'll use ts-node
  // For now, we'll create a simplified JS version
  NLPProcessor = require('../services/nlp-processor-js.js');
  ActionTranslator = require('../services/action-translator-js.js');
} catch (error) {
  console.warn('TypeScript services not available, using fallback');
}

class ConversationalConfigService {
  constructor() {
    this.aiService = AIService.getInstance();
    this.nlpProcessor = NLPProcessor ? new NLPProcessor() : null;
    this.actionTranslator = ActionTranslator ? new ActionTranslator() : null;
  }

  async processUserRequest(sessionId, userInput, conversationHistory = []) {
    try {
      // Get session data
      const sessionResponse = await fetch(`http://localhost:3001/api/sessions/${sessionId}`);
      const sessionResult = await sessionResponse.json();
      
      if (!sessionResult.success) {
        throw new Error('Session not found');
      }

      const session = sessionResult.data;

      // If NLP processor is available, use it
      if (this.nlpProcessor) {
        const nlpRequest = {
          userInput,
          sessionContext: session,
          conversationHistory
        };

        const nlpResponse = await this.nlpProcessor.processNaturalLanguageRequest(nlpRequest);
        
        if (this.actionTranslator) {
          const translationResult = await this.actionTranslator.translateNLPResponse(nlpResponse, session);
          return this.formatResponse(translationResult, nlpResponse);
        }
      }

      // Fallback to basic AI service
      return await this.fallbackProcessing(userInput, session);

    } catch (error) {
      console.error('Conversational config error:', error);
      return {
        message: 'I encountered an error processing your request. Please try rephrasing your question.',
        actions: [],
        errors: [error.message]
      };
    }
  }

  async fallbackProcessing(userInput, session) {
    // Use basic AI service with enhanced prompting
    const contextPrompt = this.buildContextPrompt(userInput, session);
    
    const aiResponse = await this.aiService.processNaturalLanguageRequest(
      contextPrompt,
      { currentStep: session.currentStep, sessionData: session }
    );

    // Parse AI response and create basic actions
    return this.parseBasicResponse(aiResponse, userInput, session);
  }

  buildContextPrompt(userInput, session) {
    const availableObjects = session.discoveredObjects?.map(obj => obj.label).join(', ') || 'None discovered';
    const selectedObjects = session.selectedObjects?.join(', ') || 'None selected';
    const currentStep = session.currentStep;

    return `You are helping configure Salesforce data generation.

Current Context:
- Step: ${currentStep}
- Available Objects: ${availableObjects}
- Selected Objects: ${selectedObjects}

User Request: "${userInput}"

Provide a helpful response and suggest specific actions. If the user wants to:
- Configure objects: Ask what objects and how many records
- Change steps: Suggest the appropriate step to navigate to
- Set up data: Guide them through the configuration process

Be specific and actionable. If you suggest actions, format them clearly.`;
  }

  parseBasicResponse(aiResponse, userInput, session) {
    let message = aiResponse.message || aiResponse.response || aiResponse;
    const actions = [];
    const lowerInput = userInput.toLowerCase();
    const lowerMessage = message.toLowerCase();

    // Detect navigation intents
    if (lowerInput.includes('navigate') || lowerInput.includes('go to') || lowerInput.includes('step')) {
      const stepKeywords = {
        'auth': 'authentication',
        'connect': 'authentication', 
        'login': 'authentication',
        'discover': 'discovery',
        'find': 'discovery',
        'select': 'selection',
        'choose': 'selection',
        'config': 'configuration',
        'setup': 'configuration',
        'preview': 'preview',
        'review': 'preview',
        'execute': 'execution',
        'run': 'execution',
        'generate': 'execution',
        'result': 'results'
      };

      for (const [keyword, step] of Object.entries(stepKeywords)) {
        if (lowerInput.includes(keyword)) {
          actions.push({
            type: 'navigate',
            label: `Go to ${step}`,
            data: { step },
            style: 'primary'
          });
          break;
        }
      }
    }

    // Detect configuration intents
    if (lowerInput.includes('configure') || lowerInput.includes('set up') || 
        lowerInput.includes('account') || lowerInput.includes('contact') || 
        lowerInput.includes('opportunity')) {
      
      // Extract potential object names and counts
      const numbers = userInput.match(/\d+/g);
      const recordCount = numbers ? parseInt(numbers[0]) : 100;

      // Common object mappings
      const objectMappings = {
        'account': 'Account',
        'company': 'Account',
        'customer': 'Account',
        'contact': 'Contact',
        'person': 'Contact',
        'people': 'Contact',
        'opportunity': 'Opportunity',
        'deal': 'Opportunity',
        'sale': 'Opportunity'
      };

      const detectedObjects = [];
      for (const [term, sfObject] of Object.entries(objectMappings)) {
        if (lowerInput.includes(term)) {
          detectedObjects.push(sfObject);
        }
      }

      if (detectedObjects.length > 0) {
        const configuration = {};
        detectedObjects.forEach(obj => {
          configuration[obj] = {
            recordCount,
            enabled: true
          };
        });

        actions.push({
          type: 'apply_config',
          label: `Configure ${detectedObjects.join(', ')} (${recordCount} records each)`,
          data: { 
            configuration: { 
              selectedObjects: detectedObjects,
              configuration 
            }
          },
          requiresConfirmation: true,
          style: 'primary'
        });
      }
    }

    return {
      message,
      actions,
      requiresConfirmation: actions.some(a => a.requiresConfirmation),
      warnings: [],
      errors: []
    };
  }

  formatResponse(translationResult, nlpResponse) {
    const actions = translationResult.actions.map(action => ({
      type: action.type === 'update_selection' ? 'apply_config' :
            action.type === 'update_configuration' ? 'apply_config' :
            action.type === 'navigate_step' ? 'navigate' :
            action.type,
      label: action.description,
      data: action.payload,
      requiresConfirmation: action.confirmationRequired,
      style: action.type === 'request_clarification' ? 'secondary' : 'primary'
    }));

    return {
      message: translationResult.userMessage,
      actions,
      configurationPreview: translationResult.updatePreview,
      requiresConfirmation: translationResult.requiresConfirmation,
      warnings: translationResult.warnings,
      errors: translationResult.validationErrors
    };
  }
}

// Create service instance
const configService = new ConversationalConfigService();

// POST /api/conversational-config/:sessionId
router.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userInput, conversationHistory } = req.body;

    if (!userInput || typeof userInput !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User input is required'
      });
    }

    const result = await configService.processUserRequest(
      sessionId,
      userInput.trim(),
      conversationHistory || []
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Conversational config API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process conversational configuration',
      details: error.message
    });
  }
});

// GET /api/conversational-config/health
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      nlpAvailable: !!NLPProcessor,
      translatorAvailable: !!ActionTranslator,
      aiServiceAvailable: configService.aiService.initialized
    }
  });
});

module.exports = router;