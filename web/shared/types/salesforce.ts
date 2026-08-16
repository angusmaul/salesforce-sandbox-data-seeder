// Salesforce domain types shared with the frontend.
//
// These mirror the CLI's definitions in src/models/salesforce.ts (and
// GenerationPlan from src/generators/data-generator.ts). They are vendored here
// so the web app is self-contained and does not import across the repo boundary
// into src/ — which kept the frontend build from being packaged on its own.
// If you change the shapes in src/, update them here too.

export interface SalesforceConnection {
  instanceUrl: string;
  accessToken: string;
  apiVersion: string;
}

export interface SalesforceCredentials {
  clientId: string;
  clientSecret: string;
  username?: string; // Optional for Client Credentials flow
  loginUrl: string;
}

export interface SandboxInfo {
  type: 'Developer' | 'Developer Pro' | 'Partial Copy' | 'Full';
  dataStorageLimit: number; // in MB
  fileStorageLimit: number; // in MB
  recordLimit?: number; // for Partial Copy sandboxes
  currentDataUsage?: number; // in MB
  currentFileUsage?: number; // in MB
}

export interface SalesforceField {
  name: string;
  apiName: string;
  type: string;
  label: string;
  length?: number;
  precision?: number;
  scale?: number;
  required: boolean;
  unique: boolean;
  createable?: boolean;
  updateable?: boolean;
  referenceTo?: string[];
  relationshipName?: string;
  picklistValues?: PicklistValue[];
  defaultValue?: string;
  calculated?: boolean;
  autoNumber?: boolean;
}

export interface PicklistValue {
  label: string;
  value: string;
  active: boolean;
  defaultValue?: boolean;
}

export interface SalesforceObject {
  name: string;
  apiName: string;
  label: string;
  labelPlural: string;
  keyPrefix?: string;
  custom: boolean;
  createable: boolean;
  updateable: boolean;
  deletable: boolean;
  queryable: boolean;
  recordTypeInfos?: RecordTypeInfo[];
  fields: SalesforceField[];
  childRelationships: ChildRelationship[];
}

export interface RecordTypeInfo {
  recordTypeId: string;
  name: string;
  developerName: string;
  active: boolean;
  defaultRecordTypeMapping: boolean;
}

export interface ChildRelationship {
  field: string;
  childSObject: string;
  relationshipName?: string;
}

export interface ObjectDependency {
  objectName: string;
  dependsOn: string[];
  dependentFields: string[];
}

export interface GenerationConfig {
  recordsPerObject: { [objectName: string]: number };
  totalRecords: number;
  respectDependencies: boolean;
  generateRelationships: boolean;
  seed?: number;
}

export interface SeedResult {
  objectName: string;
  recordsCreated: number;
  recordsFailed: number;
  errors: string[];
  timeTaken: number;
}

// From src/generators/data-generator.ts — the frontend only needs its shape.
export interface GenerationPlan {
  objectName: string;
  recordCount: number;
  fields: SalesforceField[];
  dependencies: string[];
}
