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
  validationRules?: ValidationRuleMetadata[];
  schemaAnalysis?: SchemaAnalysis;
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

// Enhanced discovery types for validation rules
export interface ValidationRuleMetadata {
  id: string;
  fullName: string;
  active: boolean;
  description?: string;
  errorConditionFormula: string;
  errorMessage: string;
  errorDisplayField?: string;
  validationName: string;
  fields?: string[]; // Fields referenced in the validation rule
  dependencies?: FieldDependency[];
  complexity: 'simple' | 'moderate' | 'complex';
  riskLevel: 'low' | 'medium' | 'high';
}

export interface FieldConstraint {
  field: string;
  type: 'required' | 'unique' | 'format' | 'range' | 'lookup' | 'custom';
  constraint: string;
  validationRule?: string; // Reference to validation rule ID
  errorMessage?: string;
  severity: 'error' | 'warning';
}

export interface FieldDependency {
  sourceField: string;
  targetField: string;
  type: 'required_if' | 'conditional' | 'lookup' | 'formula' | 'validation';
  condition?: string;
  operator?: string;
  value?: any;
}

export interface SchemaAnalysis {
  objectName: string;
  validationRules: ValidationRuleMetadata[];
  fieldConstraints: FieldConstraint[];
  fieldDependencies: FieldDependency[];
  requiredFieldPatterns: string[];
  complexityScore: number;
  riskFactors: string[];
  recommendations: string[];
  anonymized: boolean;
  analysisTimestamp: Date;
}