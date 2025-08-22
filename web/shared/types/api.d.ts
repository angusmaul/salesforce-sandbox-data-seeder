export * from '../../../src/models/salesforce';
export interface WizardSession {
    id: string;
    userId?: string;
    currentStep: WizardStep;
    connectionInfo?: SalesforceConnection;
    discoveredObjects?: SalesforceObject[];
    selectedObjects?: string[];
    generationPlan?: GenerationPlan[];
    executionResults?: SeedResult[];
    createdAt: Date;
    updatedAt: Date;
    completed: boolean;
}
export type WizardStep = 'authentication' | 'discovery' | 'selection' | 'configuration' | 'preview' | 'execution' | 'results';
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
import { SalesforceConnection, SalesforceObject, GenerationPlan, SeedResult, SandboxInfo } from '../../../src/models/salesforce';
//# sourceMappingURL=api.d.ts.map