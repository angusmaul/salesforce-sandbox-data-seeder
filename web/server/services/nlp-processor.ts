import { WizardSession, ActionPlan } from '../../shared/types/api';
import AIService from './ai-service.js';

export interface NLPRequest {
  userInput: string;
  sessionContext: Partial<WizardSession>;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}

export interface NLPResponse {
  intent: DataGenerationIntent;
  parameters: ConfigurationParameters;
  clarifications: ClarificationRequest[];
  confidence: number;
  explanation: string;
  suggestedActions: ActionPlan[];
}

export interface DataGenerationIntent {
  type: 'configure_objects' | 'set_counts' | 'specify_relationships' | 'apply_constraints' | 'generate_data' | 'navigate_step' | 'ask_question';
  subtype?: string;
  entities: ExtractedEntity[];
  scope: 'global' | 'object_specific' | 'field_specific';
}

export interface ExtractedEntity {
  type: 'object' | 'field' | 'count' | 'relationship' | 'constraint' | 'business_rule';
  value: string;
  originalText: string;
  confidence: number;
  mappedTo?: string; // Mapped Salesforce API name
}

export interface ConfigurationParameters {
  objects?: ObjectConfiguration[];
  globalSettings?: GlobalConfiguration;
  relationships?: RelationshipConfiguration[];
  businessRules?: BusinessRuleConfiguration[];
  generation?: GenerationConfiguration;
}

export interface ObjectConfiguration {
  name: string;
  recordCount?: number;
  fields?: FieldConfiguration[];
  dependencies?: string[];
  constraints?: string[];
}

export interface FieldConfiguration {
  name: string;
  type: string;
  required: boolean;
  values?: any[];
  pattern?: string;
}

export interface GlobalConfiguration {
  totalRecords?: number;
  batchSize?: number;
  respectValidation?: boolean;
  createTestData?: boolean;
  dataLocale?: string;
}

export interface RelationshipConfiguration {
  parent: string;
  child: string;
  type: 'one_to_many' | 'many_to_many' | 'lookup' | 'master_detail';
  ratio: string;
}

export interface BusinessRuleConfiguration {
  description: string;
  applies_to: string[];
  constraints: string[];
}

export interface GenerationConfiguration {
  strategy: 'realistic' | 'minimal' | 'comprehensive';
  seed?: string;
  patterns?: string[];
}

export interface ClarificationRequest {
  type: 'ambiguous_object' | 'unclear_count' | 'missing_relationship' | 'conflicting_requirements';
  question: string;
  options?: string[];
  context: string;
  priority: 'high' | 'medium' | 'low';
}

class NLPProcessor {
  private aiService: any;
  private salesforceObjectMappings: Map<string, string> = new Map();
  private businessTermMappings: Map<string, string> = new Map();

  constructor() {
    this.aiService = AIService.getInstance();
    this.initializeMappings();
  }

  private initializeMappings() {
    // Common business term to Salesforce object mappings
    this.businessTermMappings.set('customers', 'Account');
    this.businessTermMappings.set('companies', 'Account');
    this.businessTermMappings.set('accounts', 'Account');
    this.businessTermMappings.set('clients', 'Account');
    this.businessTermMappings.set('organizations', 'Account');
    this.businessTermMappings.set('people', 'Contact');
    this.businessTermMappings.set('contacts', 'Contact');
    this.businessTermMappings.set('individuals', 'Contact');
    this.businessTermMappings.set('deals', 'Opportunity');
    this.businessTermMappings.set('opportunities', 'Opportunity');
    this.businessTermMappings.set('sales', 'Opportunity');
    this.businessTermMappings.set('cases', 'Case');
    this.businessTermMappings.set('tickets', 'Case');
    this.businessTermMappings.set('issues', 'Case');
    this.businessTermMappings.set('support', 'Case');
    this.businessTermMappings.set('leads', 'Lead');
    this.businessTermMappings.set('prospects', 'Lead');
    this.businessTermMappings.set('campaigns', 'Campaign');
    this.businessTermMappings.set('marketing', 'Campaign');
    this.businessTermMappings.set('tasks', 'Task');
    this.businessTermMappings.set('activities', 'Task');
    this.businessTermMappings.set('events', 'Event');
    this.businessTermMappings.set('meetings', 'Event');
  }

  async processNaturalLanguageRequest(request: NLPRequest): Promise<NLPResponse> {
    try {
      const { userInput, sessionContext, conversationHistory = [] } = request;

      // Build context for AI analysis
      const contextData = this.buildAnalysisContext(sessionContext, conversationHistory);

      // Create structured prompt for Claude
      const analysisPrompt = this.createAnalysisPrompt(userInput, contextData);

      // Get AI analysis
      const aiResponse = await this.aiService.processNaturalLanguageRequest(
        analysisPrompt,
        contextData
      );

      // Parse AI response into structured format
      const structuredResponse = this.parseAIResponse(aiResponse, userInput, sessionContext);

      // Map business terms to Salesforce objects
      const mappedResponse = this.mapBusinessTerms(structuredResponse);

      // Generate clarifications if needed
      const clarifications = this.generateClarifications(mappedResponse, sessionContext);

      // Build final response
      return {
        intent: mappedResponse.intent,
        parameters: mappedResponse.parameters,
        clarifications,
        confidence: mappedResponse.confidence,
        explanation: mappedResponse.explanation,
        suggestedActions: this.generateSuggestedActions(mappedResponse)
      };

    } catch (error) {
      console.error('NLP processing error:', error);
      
      // Fallback response
      return {
        intent: {
          type: 'ask_question',
          subtype: 'processing_error',
          entities: [],
          scope: 'global'
        },
        parameters: {},
        clarifications: [{
          type: 'ambiguous_object',
          question: "I couldn't understand your request completely. Could you please rephrase what you'd like to configure for your data generation?",
          context: 'Processing error occurred',
          priority: 'high' as const
        }],
        confidence: 0,
        explanation: 'An error occurred while processing your request. Please try rephrasing your question.',
        suggestedActions: []
      };
    }
  }

  private buildAnalysisContext(sessionContext: Partial<WizardSession>, conversationHistory: any[]): any {
    return {
      currentStep: sessionContext.currentStep,
      discoveredObjects: sessionContext.discoveredObjects?.map(obj => ({
        name: obj.name,
        label: obj.label,
        fields: obj.fields?.slice(0, 5) // Limit context size
      })),
      selectedObjects: sessionContext.selectedObjects,
      currentConfiguration: sessionContext.configuration,
      recentMessages: conversationHistory.slice(-3), // Last 3 messages for context
      hasConnection: !!sessionContext.connectionInfo
    };
  }

  private createAnalysisPrompt(userInput: string, contextData: any): string {
    return `You are a Salesforce data generation assistant. Analyze this user request and extract configuration intent.

Current Context:
- Step: ${contextData.currentStep}
- Available Objects: ${contextData.discoveredObjects?.map((o: any) => o.label).join(', ') || 'Not discovered yet'}
- Selected Objects: ${contextData.selectedObjects?.join(', ') || 'None selected'}

User Request: "${userInput}"

Extract and return JSON with this structure:
{
  "intent": {
    "type": "configure_objects|set_counts|specify_relationships|apply_constraints|generate_data|navigate_step|ask_question",
    "subtype": "specific intent subtype",
    "entities": [{"type": "object|field|count|relationship|constraint", "value": "extracted value", "originalText": "original text", "confidence": 0.8}],
    "scope": "global|object_specific|field_specific"
  },
  "parameters": {
    "objects": [{"name": "Account", "recordCount": 100, "constraints": ["enterprise accounts"]}],
    "globalSettings": {"totalRecords": 500, "strategy": "realistic"}
  },
  "confidence": 0.85,
  "explanation": "User wants to generate 100 enterprise accounts with realistic data"
}

Focus on extracting:
1. What objects to configure (Account, Contact, Opportunity, etc.)
2. How many records (specific numbers, ranges, ratios)
3. What type of data (enterprise, small business, individual, etc.)
4. Any relationships (accounts with contacts, opportunities with accounts)
5. Special requirements (validation rules, specific fields, business scenarios)

Map common business terms:
- "customers/companies/clients" → Account
- "people/contacts" → Contact  
- "deals/sales/opportunities" → Opportunity
- "cases/tickets/support" → Case
- "leads/prospects" → Lead`;
  }

  private parseAIResponse(aiResponse: any, originalInput: string, sessionContext: Partial<WizardSession>): any {
    try {
      // Handle different AI response formats
      let parsedData;
      
      if (typeof aiResponse === 'string') {
        // Try to extract JSON from string response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } else if (aiResponse.action && aiResponse.message) {
        // Handle legacy format from existing AI service
        parsedData = this.convertLegacyResponse(aiResponse, originalInput);
      } else {
        parsedData = aiResponse;
      }

      // Validate and enhance the parsed data
      return this.validateAndEnhanceResponse(parsedData, originalInput, sessionContext);

    } catch (error) {
      console.error('Failed to parse AI response:', error);
      
      // Fallback parsing based on keywords
      return this.fallbackKeywordParsing(originalInput, sessionContext);
    }
  }

  private convertLegacyResponse(legacyResponse: any, originalInput: string): any {
    // Convert legacy AI service response to new structured format
    const intent = this.inferIntentFromLegacyAction(legacyResponse.action);
    const entities = this.extractEntitiesFromText(originalInput);
    
    return {
      intent: {
        type: intent,
        entities,
        scope: 'global'
      },
      parameters: legacyResponse.parameters || {},
      confidence: 0.6,
      explanation: legacyResponse.message
    };
  }

  private inferIntentFromLegacyAction(action: string): string {
    const actionMap: Record<string, string> = {
      'configure_settings': 'configure_objects',
      'navigate_to_step': 'navigate_step',
      'generate_data': 'generate_data',
      'ask_clarification': 'ask_question'
    };
    
    return actionMap[action] || 'ask_question';
  }

  private fallbackKeywordParsing(input: string, sessionContext: Partial<WizardSession>): any {
    const lowerInput = input.toLowerCase();
    const entities: ExtractedEntity[] = [];
    
    // Extract numbers
    const numbers = input.match(/\d+/g);
    if (numbers) {
      entities.push({
        type: 'count',
        value: numbers[0],
        originalText: numbers[0],
        confidence: 0.8
      });
    }

    // Extract business terms
    for (const [term, sfObject] of this.businessTermMappings.entries()) {
      if (lowerInput.includes(term)) {
        entities.push({
          type: 'object',
          value: term,
          originalText: term,
          confidence: 0.7,
          mappedTo: sfObject
        });
      }
    }

    // Determine intent based on keywords
    let intentType = 'ask_question';
    if (lowerInput.includes('generate') || lowerInput.includes('create')) {
      intentType = 'generate_data';
    } else if (lowerInput.includes('configure') || lowerInput.includes('set up')) {
      intentType = 'configure_objects';
    } else if (numbers && numbers.length > 0) {
      intentType = 'set_counts';
    }

    return {
      intent: {
        type: intentType,
        entities,
        scope: 'global'
      },
      parameters: this.inferParametersFromEntities(entities),
      confidence: 0.5,
      explanation: `Interpreted request using keyword analysis: ${intentType}`
    };
  }

  private validateAndEnhanceResponse(response: any, originalInput: string, sessionContext: Partial<WizardSession>): any {
    // Ensure required fields exist
    if (!response.intent) {
      response.intent = { type: 'ask_question', entities: [], scope: 'global' };
    }
    
    if (!response.parameters) {
      response.parameters = {};
    }

    if (!response.confidence) {
      response.confidence = 0.6;
    }

    // Validate object names against discovered objects
    if (response.parameters.objects && sessionContext.discoveredObjects) {
      response.parameters.objects = response.parameters.objects.map((obj: any) => {
        const discovered = sessionContext.discoveredObjects!.find(
          d => d.name.toLowerCase() === obj.name.toLowerCase() || 
               d.label.toLowerCase() === obj.name.toLowerCase()
        );
        
        if (discovered) {
          obj.name = discovered.name; // Use API name
          obj.label = discovered.label;
        }
        
        return obj;
      });
    }

    return response;
  }

  private mapBusinessTerms(response: any): any {
    // Map business terms to Salesforce objects in entities
    if (response.intent && response.intent.entities) {
      response.intent.entities = response.intent.entities.map((entity: ExtractedEntity) => {
        if (entity.type === 'object' && this.businessTermMappings.has(entity.value.toLowerCase())) {
          entity.mappedTo = this.businessTermMappings.get(entity.value.toLowerCase());
        }
        return entity;
      });
    }

    // Map in parameters.objects
    if (response.parameters && response.parameters.objects) {
      response.parameters.objects = response.parameters.objects.map((obj: ObjectConfiguration) => {
        const mappedName = this.businessTermMappings.get(obj.name.toLowerCase());
        if (mappedName) {
          obj.name = mappedName;
        }
        return obj;
      });
    }

    return response;
  }

  private generateClarifications(response: any, sessionContext: Partial<WizardSession>): ClarificationRequest[] {
    const clarifications: ClarificationRequest[] = [];

    // Check for ambiguous objects
    const objectEntities = response.intent.entities?.filter((e: ExtractedEntity) => e.type === 'object');
    if (objectEntities && objectEntities.length > 0) {
      for (const entity of objectEntities) {
        if (!entity.mappedTo && sessionContext.discoveredObjects) {
          const possibleMatches = sessionContext.discoveredObjects.filter(obj =>
            obj.label.toLowerCase().includes(entity.value.toLowerCase()) ||
            obj.name.toLowerCase().includes(entity.value.toLowerCase())
          );

          if (possibleMatches.length > 1) {
            clarifications.push({
              type: 'ambiguous_object',
              question: `I found multiple objects that could match "${entity.value}". Which one did you mean?`,
              options: possibleMatches.map(obj => `${obj.label} (${obj.name})`),
              context: `User mentioned "${entity.originalText}"`,
              priority: 'high'
            });
          }
        }
      }
    }

    // Check for missing record counts
    const countEntities = response.intent.entities?.filter((e: ExtractedEntity) => e.type === 'count');
    if (response.intent.type === 'configure_objects' && (!countEntities || countEntities.length === 0)) {
      clarifications.push({
        type: 'unclear_count',
        question: 'How many records would you like to generate?',
        options: ['10-50 (Small dataset)', '100-500 (Medium dataset)', '1000+ (Large dataset)'],
        context: 'No specific count mentioned',
        priority: 'medium'
      });
    }

    // Check for relationship clarity
    if (response.parameters.objects && response.parameters.objects.length > 1) {
      const hasRelationshipInfo = response.parameters.relationships && response.parameters.relationships.length > 0;
      if (!hasRelationshipInfo) {
        clarifications.push({
          type: 'missing_relationship',
          question: 'How should these objects be related to each other?',
          context: `Multiple objects specified: ${response.parameters.objects.map((o: ObjectConfiguration) => o.name).join(', ')}`,
          priority: 'medium'
        });
      }
    }

    return clarifications;
  }

  private generateSuggestedActions(response: any): ActionPlan[] {
    const actions: ActionPlan[] = [];

    if (response.intent.type === 'configure_objects' && response.parameters.objects) {
      actions.push({
        action: 'configure',
        parameters: response.parameters,
        explanation: `Configure ${response.parameters.objects.map((o: ObjectConfiguration) => o.name).join(', ')} with specified settings`,
        confidence: response.confidence,
        steps: [
          'Update wizard configuration',
          'Set record counts',
          'Apply constraints',
          'Review settings'
        ]
      });
    }

    if (response.intent.type === 'navigate_step') {
      const targetStep = this.inferTargetStep(response);
      actions.push({
        action: 'navigate',
        parameters: { step: targetStep },
        explanation: `Navigate to the ${targetStep} step`,
        confidence: response.confidence
      });
    }

    if (response.intent.type === 'generate_data') {
      actions.push({
        action: 'generate',
        parameters: response.parameters,
        explanation: 'Begin data generation with current configuration',
        confidence: response.confidence,
        steps: [
          'Validate configuration',
          'Generate data',
          'Load to Salesforce',
          'Show results'
        ]
      });
    }

    return actions;
  }

  private inferTargetStep(response: any): string {
    const input = response.explanation.toLowerCase();
    
    if (input.includes('auth') || input.includes('connect') || input.includes('login')) {
      return 'authentication';
    }
    if (input.includes('discover') || input.includes('find') || input.includes('object')) {
      return 'discovery';
    }
    if (input.includes('select') || input.includes('choose')) {
      return 'selection';
    }
    if (input.includes('config') || input.includes('settings')) {
      return 'configuration';
    }
    if (input.includes('preview') || input.includes('review')) {
      return 'preview';
    }
    if (input.includes('run') || input.includes('execute') || input.includes('generate')) {
      return 'execution';
    }
    if (input.includes('result') || input.includes('summary')) {
      return 'results';
    }
    
    return 'configuration'; // Default
  }

  private extractEntitiesFromText(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const lowerText = text.toLowerCase();

    // Extract numbers
    const numberMatches = text.match(/\b\d+\b/g);
    if (numberMatches) {
      numberMatches.forEach(num => {
        entities.push({
          type: 'count',
          value: num,
          originalText: num,
          confidence: 0.9
        });
      });
    }

    // Extract business terms
    for (const [term, sfObject] of this.businessTermMappings.entries()) {
      if (lowerText.includes(term)) {
        entities.push({
          type: 'object',
          value: term,
          originalText: term,
          confidence: 0.8,
          mappedTo: sfObject
        });
      }
    }

    return entities;
  }

  private inferParametersFromEntities(entities: ExtractedEntity[]): ConfigurationParameters {
    const parameters: ConfigurationParameters = {};
    
    const objectEntities = entities.filter(e => e.type === 'object');
    const countEntities = entities.filter(e => e.type === 'count');

    if (objectEntities.length > 0) {
      parameters.objects = objectEntities.map(entity => ({
        name: entity.mappedTo || entity.value,
        recordCount: countEntities.length > 0 ? parseInt(countEntities[0].value) : 100,
        fields: [],
        dependencies: [],
        constraints: []
      }));
    }

    if (countEntities.length > 0) {
      parameters.globalSettings = {
        totalRecords: parseInt(countEntities[0].value)
      };
    }

    return parameters;
  }

  // Public methods for testing and debugging
  async analyzeUserInput(input: string, context: Partial<WizardSession>): Promise<any> {
    const request: NLPRequest = {
      userInput: input,
      sessionContext: context
    };
    
    return this.processNaturalLanguageRequest(request);
  }

  getBusinessTermMappings(): Map<string, string> {
    return new Map(this.businessTermMappings);
  }
}

export default NLPProcessor;