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

// Import types from CLI
import { 
  SalesforceConnection, 
  SalesforceObject, 
  SeedResult,
  SandboxInfo 
} from '../../../src/models/salesforce';

import { GenerationPlan } from '../../../src/generators/data-generator';