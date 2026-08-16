// Re-export the Salesforce domain types (vendored in ./salesforce)
export * from './salesforce';

// Additional web-specific types
export interface WizardSession {
  id: string;
  userId?: string;
  currentStep: WizardStep;
  connectionId?: string;
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
  aiGenerationPlan?: AIGenerationPlan;
  aiCompanyProfile?: CompanyProfile;
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

// A saved, reusable org connection (server masks the client secret)
export interface SavedConnection {
  id: string;
  label: string;
  instanceUrl: string | null;
  loginUrl: string | null;
  clientId: string;
  clientSecretHint: string | null;
  orgId: string | null;
  orgName: string | null;
  isSandbox: boolean | null;
  createdAt: string;
  lastUsedAt: string;
  lastValidatedAt: string | null;
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

// Types used by the interfaces below
import {
  SalesforceConnection,
  SalesforceObject,
  SeedResult,
  SandboxInfo,
  GenerationPlan
} from './salesforce';

// AI Generation Plan types
export type CompanyProfile = 'small' | 'medium' | 'enterprise' | 'mixed';

export interface AIFieldMapping {
  category: string;
  subcategory: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface AICorrelation {
  type: 'department_jobtitle' | 'country_phone' | 'name_email' | 'country_address' | 'company_size';
  fields: string[];
}

export interface AIObjectPlan {
  fieldMappings: { [fieldName: string]: AIFieldMapping };
  correlations: AICorrelation[];
}

export interface AIGenerationPlan {
  [objectName: string]: AIObjectPlan;
}

export interface CategoryOption {
  category: string;
  subcategory: string;
}