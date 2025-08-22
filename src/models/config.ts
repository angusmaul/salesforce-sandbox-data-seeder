export interface AppConfig {
  salesforce: SalesforceConfig;
  generation: GenerationSettings;
  objectSelection: ObjectSelectionConfig;
}

export interface SalesforceConfig {
  loginUrl: string;
  apiVersion: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
}

export interface GenerationSettings {
  defaultRecordsPerObject: number;
  maxTotalRecords: number;
  respectStorageLimits: boolean;
  generateRelationships: boolean;
  faker: FakerSettings;
}

export interface FakerSettings {
  locale: string;
  seed?: number;
}

export interface ObjectSelectionConfig {
  includePatterns: string[];
  excludePatterns: string[];
  includedObjects: string[];
  excludedObjects: string[];
  presets: ObjectSelectionPreset[];
}

export interface ObjectSelectionPreset {
  name: string;
  description: string;
  includedObjects: string[];
  excludedObjects?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface SessionConfig {
  lastConnection?: {
    instanceUrl: string;
    username: string;
    sandboxType: string;
    connectedAt: string;
  };
  lastObjectSelection?: string[];
  lastGenerationSettings?: Partial<GenerationSettings>;
}