// Re-export types from CLI for consistency
export * from '../../../src/models/salesforce';

// Additional web-specific types
export interface WizardSession {
  id: string;
  userId?: string;
  currentStep: WizardStep;
  connectionInfo?: SalesforceConnection;
  oauthCredentials?: {
    clientId: string;
    clientSecret: string;
    loginUrl: string;
  };
  discoveredObjects?: SalesforceObject[];
  selectedObjects?: string[];
  fieldAnalysis?: { [key: string]: any };
  configuration?: { [key: string]: any };
  globalSettings?: GlobalSettings;
  dataGenerationPreferences?: DataGenerationPreferences;
  generationPlan?: GenerationPlan[];
  executionResults?: SeedResult[];
  loadSessionId?: string;
  // Enhanced discovery fields
  enhancedDiscovery?: boolean;
  aiSchemaSummary?: any;
  anonymizationMap?: { [anonymizedName: string]: string };
  validationRuleCache?: { [objectName: string]: any };
  createdAt: Date;
  updatedAt: Date;
  completed: boolean;
}

export type WizardStep = 
  | 'authentication'
  | 'discovery'
  | 'selection'
  | 'configuration'
  | 'preview'
  | 'execution'
  | 'results';

export interface GlobalSettings {
  batchSize: number;
  respectRequiredFields: boolean;
  skipValidationRules: boolean;
  createTestData: boolean;
}

export interface DataGenerationPreferences {
  selectedCountries?: string[];
  customStateMapping?: { [countryCode: string]: string[] };
  useOrgPicklists?: boolean;
  savedAt?: Date;
}

export interface CountryMetadata {
  code: string;
  name: string;
  default: boolean;
}

export interface StateCountryMapping {
  [countryCode: string]: string[];
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface ProgressUpdate {
  sessionId: string;
  step: WizardStep;
  progress: number;
  message: string;
  data?: any;
}

export interface AuthResponse {
  authUrl: string;
  state: string;
}

export interface ConnectionStatus {
  connected: boolean;
  instanceUrl?: string;
  organizationName?: string;
  isSandbox?: boolean;
  sandboxInfo?: SandboxInfo;
  setupRequired?: boolean;
  setupInstructions?: string;
}

export interface ClaudeRequest {
  message: string;
  context?: {
    step: WizardStep;
    sessionData?: Partial<WizardSession>;
    error?: string;
  };
}

export interface ClaudeResponse {
  message: string;
  suggestions?: string[];
  actions?: ClaudeAction[];
}

export interface ClaudeAction {
  type: 'navigate' | 'configure' | 'retry' | 'explain';
  label: string;
  data?: any;
}

// Chat interface types
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  metadata?: {
    tokens?: number;
    responseTime?: number;
    error?: string;
    suggestions?: string[];
    actions?: ClaudeAction[];
  };
}

export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  isTyping?: boolean;
  lastActivity: Date;
  context?: {
    step: WizardStep;
    sessionData?: Partial<WizardSession>;
  };
}

export interface StreamingChatRequest {
  sessionId: string;
  message: string;
  context?: {
    step: WizardStep;
    sessionData?: Partial<WizardSession>;
    error?: string;
  };
}

export interface StreamingChatResponse {
  messageId: string;
  sessionId: string;
  content: string;
  isComplete: boolean;
  timestamp: string;
  metadata?: {
    tokens?: number;
    responseTime?: number;
    error?: string;
    suggestions?: string[];
    actions?: ClaudeAction[];
  };
}

// AI Service Types
export interface AIServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  uptime: number;
}

export interface AIUsageStats {
  totalRequests: number;
  totalTokens: number;
  successRate: number;
  averageResponseTime: number;
  costEstimate: number;
  lastReset: Date;
  rateLimitHits: number;
}

export interface SchemaAnalysisRequest {
  sessionId: string;
  schemaData: any;
}

export interface SchemaAnalysisResponse {
  objectType: string;
  validationRules: ValidationRule[];
  fieldDependencies: FieldDependency[];
  suggestions: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  riskFactors: string[];
}

export interface ValidationRule {
  type: 'required' | 'unique' | 'format' | 'range' | 'custom';
  field: string;
  constraint: string;
  errorMessage?: string;
  severity: 'error' | 'warning';
}

export interface FieldDependency {
  sourceField: string;
  targetField: string;
  type: 'required_if' | 'conditional' | 'lookup' | 'formula';
  condition?: string;
}

export interface FieldSuggestionRequest {
  sessionId: string;
  objectType: string;
  fieldType: string;
  context?: any;
}

export interface FieldSuggestion {
  field: string;
  value: any;
  confidence: number;
  reasoning: string;
  alternatives?: any[];
}

export interface DataValidationRequest {
  sessionId: string;
  data: any;
  validationRules: ValidationRule[];
}

export interface ValidationResult {
  isValid: boolean;
  violations: ValidationViolation[];
  suggestions: string[];
  riskScore: number;
}

export interface ValidationViolation {
  field: string;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  suggestedFix?: string;
}

export interface NaturalLanguageRequest {
  sessionId: string;
  userInput: string;
}

export interface ActionPlan {
  action: 'configure' | 'navigate' | 'generate' | 'validate' | 'explain';
  parameters: Record<string, any>;
  explanation: string;
  confidence: number;
  steps?: string[];
}

// Import types from CLI
import { 
  SalesforceConnection, 
  SalesforceObject, 
  SeedResult,
  SandboxInfo 
} from '../../../src/models/salesforce';

import { GenerationPlan } from '../../../src/generators/data-generator';