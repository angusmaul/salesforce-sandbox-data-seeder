import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { APIResponse, ClaudeRequest, ClaudeResponse } from '../../shared/types/api';

const router = express.Router();

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * Chat with Claude AI assistant
 */
router.post('/chat/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, context }: ClaudeRequest = req.body;
    
    if (!anthropic.apiKey) {
      return res.status(503).json({
        success: false,
        error: 'Claude AI is not configured. Please set ANTHROPIC_API_KEY environment variable.',
        timestamp: new Date().toISOString()
      });
    }
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    // Build context-aware prompt
    const systemPrompt = buildSystemPrompt(session, context);
    const userPrompt = buildUserPrompt(message, context);
    
    // Call Claude API
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });
    
    // Extract text content from response
    const responseText = claudeResponse.content
      .filter(item => item.type === 'text')
      .map(item => (item as any).text)
      .join('\n');
    
    // Parse response for structured data
    const parsedResponse = parseClaudeResponse(responseText, context);
    
    const response: APIResponse<ClaudeResponse> = {
      success: true,
      data: parsedResponse,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error('Claude API error:', error);
    
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with Claude AI',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get contextual help for current wizard step
 */
router.get('/help/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const helpContent = getStepHelp(session.currentStep, session);
    
    const response: APIResponse = {
      success: true,
      data: helpContent,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get contextual help',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Get suggestions for current wizard step
 */
router.get('/suggestions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = req.sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const suggestions = getStepSuggestions(session.currentStep, session);
    
    const response: APIResponse = {
      success: true,
      data: { suggestions },
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get suggestions',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

/**
 * Analyze and explain errors
 */
router.post('/explain-error/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { error, context } = req.body;
    
    if (!anthropic.apiKey) {
      return res.status(503).json({
        success: false,
        error: 'Claude AI is not configured',
        timestamp: new Date().toISOString()
      });
    }
    
    const session = req.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }
    
    const explanation = await explainError(error, context, session);
    
    const response: APIResponse = {
      success: true,
      data: explanation,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to explain error',
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(response);
  }
});

// Helper functions

function buildSystemPrompt(session: any, context?: any): string {
  return `You are an AI assistant helping users with Salesforce sandbox data seeding. You are knowledgeable about:

- Salesforce data model and API limitations
- Best practices for data generation and loading
- Common Salesforce errors and their solutions
- Relationship management and dependency handling
- Storage optimization for different sandbox types

Current session context:
- Current step: ${session.currentStep}
- Connected to: ${session.connectionInfo?.instanceUrl || 'Not connected'}
- Objects discovered: ${session.discoveredObjects?.length || 0}
- Objects selected: ${session.selectedObjects?.length || 0}

Provide helpful, accurate, and actionable advice. If you suggest actions, be specific about which buttons to click or steps to take in the wizard.`;
}

function buildUserPrompt(message: string, context?: any): string {
  let prompt = message;
  
  if (context?.error) {
    prompt += `\n\nI'm encountering this error: ${context.error}`;
  }
  
  if (context?.step) {
    prompt += `\n\nThis is happening during the ${context.step} step.`;
  }
  
  return prompt;
}

function parseClaudeResponse(responseText: string, context?: any): ClaudeResponse {
  // Basic parsing - could be enhanced with more sophisticated NLP
  const lines = responseText.split('\n');
  const suggestions: string[] = [];
  const actions: any[] = [];
  
  // Look for bullet points or numbered lists as suggestions
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.match(/^[-*•]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      suggestions.push(trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, ''));
    }
  });
  
  // Look for action keywords
  if (responseText.includes('click') || responseText.includes('navigate')) {
    actions.push({
      type: 'navigate',
      label: 'Follow suggested steps',
      data: {}
    });
  }
  
  if (responseText.includes('try again') || responseText.includes('retry')) {
    actions.push({
      type: 'retry',
      label: 'Retry the operation',
      data: {}
    });
  }
  
  return {
    message: responseText,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    actions: actions.length > 0 ? actions : undefined
  };
}

function getStepHelp(step: string, session: any): any {
  const helpContent: { [key: string]: any } = {
    authentication: {
      title: 'Authentication & Connection',
      description: 'Connect to your Salesforce sandbox using OAuth 2.0',
      tips: [
        'Make sure you\'re connecting to a sandbox, not production',
        'You\'ll need a Connected App configured in your Salesforce org',
        'Ensure your Connected App has the correct OAuth settings'
      ],
      commonIssues: [
        'OAuth error: Check your Connected App configuration',
        'Invalid client credentials: Verify your Client ID and Secret',
        'Redirect URI mismatch: Ensure the redirect URI matches your Connected App'
      ]
    },
    discovery: {
      title: 'Schema Discovery',
      description: 'Discover and analyze your Salesforce objects and fields',
      tips: [
        'Discovery may take a few minutes for large orgs',
        'Custom objects are automatically identified',
        'Field relationships are analyzed for dependency ordering'
      ],
      commonIssues: [
        'Slow discovery: This is normal for orgs with many objects',
        'Missing objects: Check object permissions and access settings',
        'API limit errors: The tool will automatically retry'
      ]
    },
    selection: {
      title: 'Object Selection',
      description: 'Choose which objects to populate with sample data',
      tips: [
        'Use presets for common scenarios',
        'Objects are ordered by dependencies automatically',
        'Consider starting with core objects like Account and Contact'
      ],
      commonIssues: [
        'Dependency conflicts: The tool will reorder objects automatically',
        'Too many objects: Consider focusing on essential objects first'
      ]
    },
    configuration: {
      title: 'Record Count Configuration',
      description: 'Set how many records to create for each object',
      tips: [
        'The tool automatically calculates storage-safe limits',
        'Developer sandboxes have limited storage (15MB)',
        'Consider relationships when setting record counts'
      ],
      commonIssues: [
        'Storage warnings: Reduce record counts to stay within limits',
        'Unbalanced relationships: Ensure parent objects have enough records'
      ]
    },
    preview: {
      title: 'Data Preview',
      description: 'Review sample data before generation',
      tips: [
        'Check that field values look realistic',
        'Verify relationships are properly configured',
        'Use the preview to catch potential issues early'
      ]
    },
    execution: {
      title: 'Data Generation & Loading',
      description: 'Generate and load data into your sandbox',
      tips: [
        'Progress is shown in real-time',
        'Errors are logged with detailed information',
        'The process respects Salesforce API limits'
      ],
      commonIssues: [
        'Validation errors: Check required fields and field constraints',
        'Duplicate errors: Ensure unique field constraints are respected',
        'Timeout errors: The tool will automatically retry'
      ]
    },
    results: {
      title: 'Results & Analysis',
      description: 'Review the results of your data loading',
      tips: [
        'Download detailed logs for analysis',
        'Review any errors for future improvements',
        'Check the generated data in your Salesforce org'
      ]
    }
  };
  
  return helpContent[step] || {
    title: 'General Help',
    description: 'General assistance for the data seeding wizard',
    tips: ['Use the chat assistant for specific questions']
  };
}

function getStepSuggestions(step: string, session: any): string[] {
  const suggestions: { [key: string]: string[] } = {
    authentication: [
      'Ensure you have a Connected App configured in your Salesforce org',
      'Check that OAuth settings are correctly configured',
      'Verify you\'re connecting to a sandbox environment'
    ],
    discovery: [
      'Be patient - discovery can take several minutes for large orgs',
      'Review the discovered objects to understand your data model',
      'Check the relationships view to see object dependencies'
    ],
    selection: [
      'Start with core objects like Account, Contact, and Lead',
      'Use presets for common scenarios',
      'Consider your testing needs when selecting objects'
    ],
    configuration: [
      'Review storage warnings carefully',
      'Balance record counts with relationship requirements',
      'Consider starting with smaller numbers for testing'
    ],
    execution: [
      'Monitor progress and error logs during execution',
      'Don\'t close the browser window during data loading',
      'Be prepared to address any validation errors'
    ]
  };
  
  return suggestions[step] || [
    'Use the chat assistant for specific questions',
    'Check the help section for detailed guidance'
  ];
}

async function explainError(error: string, context: any, session: any): Promise<any> {
  const prompt = `Explain this Salesforce error and provide specific solutions:

Error: ${error}
Context: ${JSON.stringify(context, null, 2)}

Please provide:
1. What this error means in plain English
2. Common causes of this error
3. Specific steps to resolve it
4. How to prevent it in the future`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 800,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const explanation = response.content
      .filter(item => item.type === 'text')
      .map(item => (item as any).text)
      .join('\n');
    
    return {
      explanation,
      suggestions: [
        'Check field validation rules',
        'Verify required field values',
        'Review object permissions'
      ]
    };
  } catch (error) {
    return {
      explanation: 'Unable to get AI explanation for this error.',
      suggestions: [
        'Check the Salesforce error documentation',
        'Review your object configuration',
        'Try reducing the number of records'
      ]
    };
  }
}

export default router;