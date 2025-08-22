import { faker } from '@faker-js/faker';
import { SalesforceField, SalesforceObject, SandboxInfo, GenerationConfig } from '../models/salesforce';
import chalk from 'chalk';

export interface GenerationPlan {
  objectName: string;
  recordCount: number;
  fields: SalesforceField[];
  dependencies: string[];
}

export class DataGenerationService {
  private referenceStore: Map<string, any[]> = new Map();
  
  constructor(locale: string = 'en', seed?: number) {
    // Set locale using faker's setDefaultRefDate method for newer versions
    if (seed) {
      faker.seed(seed);
    }
  }

  async createGenerationPlan(
    selectedObjects: string[],
    recordsPerObject: number,
    sandboxInfo: SandboxInfo,
    objects?: SalesforceObject[],
    useExactCounts: boolean = false
  ): Promise<GenerationPlan[]> {
    const plan: GenerationPlan[] = [];
    
    // Calculate adjusted record counts based on sandbox limits (unless exact counts requested)
    const adjustedCounts = useExactCounts 
      ? this.createExactCounts(selectedObjects, recordsPerObject)
      : this.calculateRecordCounts(selectedObjects, recordsPerObject, sandboxInfo);
    
    // If objects metadata is provided, use it to determine dependencies
    if (objects) {
      const objectMap = new Map(objects.map(obj => [obj.name, obj]));
      
      for (const objectName of selectedObjects) {
        const objectMeta = objectMap.get(objectName);
        if (objectMeta) {
          const dependencies = this.findDependencies(objectMeta, selectedObjects);
          plan.push({
            objectName,
            recordCount: adjustedCounts[objectName] || recordsPerObject,
            fields: objectMeta.fields,
            dependencies
          });
        }
      }
      
      // Sort by dependencies (objects with no dependencies first)
      return this.sortPlanByDependencies(plan);
    } else {
      // Simple plan without dependency analysis
      for (const objectName of selectedObjects) {
        plan.push({
          objectName,
          recordCount: adjustedCounts[objectName] || recordsPerObject,
          fields: [],
          dependencies: []
        });
      }
      return plan;
    }
  }

  generateRecords(salesforceObject: SalesforceObject, count: number): any[] {
    const objectName = salesforceObject.name;
    const fields = salesforceObject.fields;
    const records: any[] = [];
    
    // Debug: Log field analysis
    const totalFields = fields.length;
    const skippedFieldsWithReason: string[] = [];
    const populatedFields: string[] = [];
    
    console.log(chalk.blue(`\n📊 Analyzing ${objectName} fields:`));
    console.log(chalk.blue(`   Total fields: ${totalFields}`));
    
    for (let i = 0; i < count; i++) {
      const record: any = {};
      
      // Handle RecordTypeId only if the object has multiple record types or non-Master record types
      if (salesforceObject.recordTypeInfos && salesforceObject.recordTypeInfos.length > 0) {
        // Check if there are multiple record types or any non-Master record types
        const hasMultipleRecordTypes = salesforceObject.recordTypeInfos.length > 1;
        const hasNonMasterRecordTypes = salesforceObject.recordTypeInfos.some(rt => rt.name !== 'Master');
        
        if (hasMultipleRecordTypes || hasNonMasterRecordTypes) {
          const defaultRecordType = salesforceObject.recordTypeInfos.find(rt => rt.defaultRecordTypeMapping && rt.active);
          if (defaultRecordType) {
            record.RecordTypeId = defaultRecordType.recordTypeId;
            if (i === 0) populatedFields.push('RecordTypeId (default)');
          }
        } else {
          // Only Master record type exists - skip RecordTypeId to let Salesforce handle it automatically
          if (i === 0) skippedFieldsWithReason.push('RecordTypeId (only Master type)');
        }
      }
      
      for (const field of fields) {
        // Skip RecordTypeId if we already set it above
        if (field.name === 'RecordTypeId' && record.RecordTypeId) {
          if (i === 0) skippedFieldsWithReason.push(`${field.name} (already set)`);
          continue;
        }
        
        // Skip system fields and non-createable fields
        if (this.shouldSkipField(field)) {
          if (i === 0) {
            const reason = this.getSkipReason(field);
            skippedFieldsWithReason.push(`${field.name} (${reason})`);
          }
          continue;
        }
        
        const value = this.generateFieldValue(field, objectName, salesforceObject);
        if (value !== null && value !== undefined) {
          record[field.name] = value;
          if (i === 0) populatedFields.push(field.name); // Only log on first record
        } else {
          if (i === 0) {
            // Special debugging for reference fields
            if (field.type === 'reference' && field.name.includes('Id')) {
              console.log(chalk.yellow(`   🐛 DEBUG: ${field.name} (${field.type}) returned null, referenceTo: ${field.referenceTo?.join(',') || 'none'}`));
            }
            skippedFieldsWithReason.push(`${field.name} (null value)`);
          }
        }
      }
      
      records.push(record);
    }
    
    // Debug: Show field statistics  
    console.log(chalk.green(`   ✅ Populated fields (${populatedFields.length}): ${populatedFields.slice(0, 10).join(', ')}${populatedFields.length > 10 ? '...' : ''}`));
    console.log(chalk.yellow(`   ⏭️  Skipped fields (${skippedFieldsWithReason.length}): ${skippedFieldsWithReason.slice(0, 15).join(', ')}${skippedFieldsWithReason.length > 15 ? '...' : ''}`));
    
    // Show field type analysis
    const fieldTypeStats: { [type: string]: number } = {};
    fields.forEach(field => {
      fieldTypeStats[field.type] = (fieldTypeStats[field.type] || 0) + 1;
    });
    console.log(chalk.blue(`   📋 Field types found: ${Object.entries(fieldTypeStats).map(([type, count]) => `${type}(${count})`).join(', ')}`));
    
    // Store generated records for reference in other objects
    this.referenceStore.set(objectName, records);
    
    return records;
  }

  private generateFieldValue(field: SalesforceField, objectName: string, salesforceObject?: SalesforceObject): any {
    // Handle required fields vs optional fields
    const isRequired = field.required && !field.defaultValue;
    
    // For address component fields, always generate data (they're important)
    const isAddressField = this.isAddressComponentField(field.name);
    
    // For optional fields, skip only 10% of the time to populate more fields (was 20%)
    // But never skip address component fields
    if (!isRequired && !isAddressField && faker.datatype.boolean({ probability: 0.1 })) {
      return null;
    }

    // Use default value if available (reduced probability to populate more fields)
    if (field.defaultValue && faker.datatype.boolean({ probability: 0.3 })) {
      return field.defaultValue;
    }

    // Handle RecordTypeId specially - only set if multiple or non-Master record types exist
    if (field.name === 'RecordTypeId' && field.referenceTo?.includes('RecordType')) {
      if (salesforceObject?.recordTypeInfos && salesforceObject.recordTypeInfos.length > 0) {
        const hasMultipleRecordTypes = salesforceObject.recordTypeInfos.length > 1;
        const hasNonMasterRecordTypes = salesforceObject.recordTypeInfos.some(rt => rt.name !== 'Master');
        
        if (hasMultipleRecordTypes || hasNonMasterRecordTypes) {
          const defaultRecordType = salesforceObject.recordTypeInfos.find(rt => rt.defaultRecordTypeMapping && rt.active);
          if (defaultRecordType) {
            return defaultRecordType.recordTypeId;
          }
        }
        // Skip RecordTypeId when only Master record type exists
      }
      return null;
    }

    // Skip relationship fields for now to avoid ID issues, but be more selective
    if (field.referenceTo && field.referenceTo.length > 0) {
      // Skip complex relationships but allow simple lookups that might have defaults
      if (field.referenceTo.includes('User')) {
        return null;
      }
      // For other references, skip for now
      return null;
    }

    // Handle picklist fields
    if (field.picklistValues && field.picklistValues.length > 0) {
      const activeValues = field.picklistValues.filter(pv => pv.active);
      if (activeValues.length > 0) {
        return faker.helpers.arrayElement(activeValues).value;
      }
    }

    // Generate value based on Salesforce field type using systematic rules
    return this.generateByFieldType(field, objectName);
  }

  private generateByFieldType(field: SalesforceField, objectName: string): any {
    const fieldType = field.type.toLowerCase();
    
    switch (fieldType) {
      // === TEXT-BASED FIELD TYPES ===
      case 'string':
        return this.generateStringValue(field, objectName);
      
      case 'textarea':
        return this.generateTextAreaValue(field, objectName);
      
      // === COMMUNICATION FIELD TYPES ===
      case 'email':
        return faker.internet.email();
      
      case 'phone':
        return faker.phone.number();
      
      case 'url':
        return faker.internet.url();
      
      // === NUMERIC FIELD TYPES ===
      case 'int':
      case 'integer':
        return this.generateIntegerValue(field);
      
      case 'double':
        return this.generateDoubleValue(field);
      
      case 'currency':
        return this.generateCurrencyValue(field);
      
      case 'percent':
        return this.generatePercentValue(field);
      
      // === DATE/TIME FIELD TYPES ===
      case 'date':
        return this.generateDateValue(field);
      
      case 'datetime':
        return this.generateDateTimeValue(field);
      
      case 'time':
        return this.generateTimeValue(field);
      
      // === CHOICE FIELD TYPES ===
      case 'boolean':
        return faker.datatype.boolean();
      
      case 'picklist':
        return this.generatePicklistValue(field);
      
      case 'multipicklist':
        return this.generateMultiPicklistValue(field);
      
      // === RELATIONSHIP FIELD TYPES ===
      case 'reference':
        return this.generateReferenceValue(field);
      
      // === COMPOUND FIELD TYPES ===
      case 'address':
        return null; // These are virtual compound fields, skip them
      
      case 'location':
        return null; // Geographic location compound field
      
      // === SPECIAL FIELD TYPES ===
      case 'id':
        return null; // Never generate IDs manually
      
      case 'base64':
        return null; // Binary data, skip for now
      
      case 'combobox':
        return this.generateComboboxValue(field);
      
      case 'encryptedstring':
        return this.generateEncryptedStringValue(field);
      
      case 'json':
        return this.generateJsonValue(field);
      
      default:
        console.warn(chalk.yellow(`⚠️  Unknown field type '${fieldType}' for field '${field.name}', using contextual generation`));
        return this.generateContextualValue(field, objectName);
    }
  }

  private generateStringValue(field: SalesforceField, objectName: string): string | undefined {
    const maxLength = field.length || 255;
    
    // Generate contextual content based on field name
    const fieldNameLower = field.name.toLowerCase();
    
    if (fieldNameLower.includes('name')) {
      if (fieldNameLower.includes('first') || fieldNameLower.includes('fname')) {
        return faker.person.firstName();
      } else if (fieldNameLower.includes('last') || fieldNameLower.includes('lname')) {
        return faker.person.lastName();
      } else if (fieldNameLower.includes('company') || fieldNameLower.includes('account')) {
        return faker.company.name();
      } else if (objectName === 'Account' && fieldNameLower === 'name') {
        // Generate business names for Account.Name field
        return faker.company.name();
      } else {
        return faker.person.fullName();
      }
    }
    
    if (fieldNameLower.includes('title') || fieldNameLower.includes('position')) {
      return faker.person.jobTitle();
    }
    
    if (fieldNameLower.includes('description') || fieldNameLower.includes('notes')) {
      return faker.lorem.paragraph().substring(0, maxLength);
    }
    
    // Handle address component fields specifically and reliably
    if (fieldNameLower.includes('street')) {
      return faker.location.streetAddress();
    }
    
    if (fieldNameLower.includes('city')) {
      return faker.location.city();
    }
    
    if (fieldNameLower.includes('state') || fieldNameLower.includes('province')) {
      return faker.location.state();
    }
    
    if (fieldNameLower.includes('postal') || fieldNameLower.includes('zip') || fieldNameLower.includes('postcode')) {
      return faker.location.zipCode();
    }
    
    if (fieldNameLower.includes('country')) {
      return faker.location.country();
    }
    
    // Handle other address-related fields
    if (fieldNameLower.includes('address') && !['billingaddress', 'shippingaddress', 'mailingaddress', 'otheraddress'].includes(fieldNameLower)) {
      return faker.location.streetAddress();
    }
    
    // Generate random string with appropriate length
    const content = faker.lorem.words(3);
    return content.length > maxLength ? content.substring(0, maxLength) : content;
  }

  private generateTextAreaValue(field: SalesforceField, objectName: string): string {
    const maxLength = field.length || 32000; // Default textarea length
    const fieldNameLower = field.name.toLowerCase();
    
    if (fieldNameLower.includes('description') || fieldNameLower.includes('notes') || fieldNameLower.includes('comment')) {
      const paragraphs = Math.min(3, Math.floor(maxLength / 200));
      return faker.lorem.paragraphs(paragraphs).substring(0, maxLength);
    }
    
    return faker.lorem.paragraph().substring(0, maxLength);
  }

  private generateDoubleValue(field: SalesforceField): number {
    return this.generateDecimalValue(field);
  }

  private generateCurrencyValue(field: SalesforceField): number {
    const min = 0.01;
    const max = field.precision ? Math.pow(10, field.precision - (field.scale || 2)) - 1 : 100000;
    const scale = field.scale || 2;
    return parseFloat(faker.number.float({ min, max, multipleOf: Math.pow(10, -scale) }).toFixed(scale));
  }

  private generatePercentValue(field: SalesforceField): number {
    const scale = field.scale || 2;
    return parseFloat(faker.number.float({ min: 0, max: 100, multipleOf: Math.pow(10, -scale) }).toFixed(scale));
  }

  private generateDateValue(field: SalesforceField): string {
    return faker.date.between({ from: '2020-01-01', to: new Date() }).toISOString().split('T')[0];
  }

  private generateDateTimeValue(field: SalesforceField): string {
    return faker.date.between({ from: '2020-01-01', to: new Date() }).toISOString();
  }

  private generateTimeValue(field: SalesforceField): string {
    const date = faker.date.recent();
    return date.toTimeString().split(' ')[0]; // HH:MM:SS format
  }

  private generatePicklistValue(field: SalesforceField): string {
    if (field.picklistValues && field.picklistValues.length > 0) {
      const activeValues = field.picklistValues.filter(pv => pv.active);
      if (activeValues.length > 0) {
        return faker.helpers.arrayElement(activeValues).value;
      }
    }
    return this.generatePicklistFallback(field);
  }

  private generateMultiPicklistValue(field: SalesforceField): string {
    if (field.picklistValues && field.picklistValues.length > 0) {
      const activeValues = field.picklistValues.filter(pv => pv.active);
      if (activeValues.length > 0) {
        const numValues = faker.number.int({ min: 1, max: Math.min(3, activeValues.length) });
        const selectedValues = faker.helpers.arrayElements(activeValues, numValues);
        return selectedValues.map(v => v.value).join(';');
      }
    }
    return this.generatePicklistFallback(field);
  }

  private generateComboboxValue(field: SalesforceField): string {
    return this.generatePicklistValue(field); // Combobox is similar to picklist
  }

  private generateEncryptedStringValue(field: SalesforceField): string {
    const maxLength = Math.min(field.length || 175, 175); // Encrypted strings have limits
    return faker.lorem.words(3).substring(0, maxLength);
  }

  private generateJsonValue(field: SalesforceField): string {
    return JSON.stringify({
      id: faker.number.int({ min: 1, max: 1000 }),
      name: faker.lorem.word(),
      active: faker.datatype.boolean()
    });
  }

  private generateIntegerValue(field: SalesforceField): number {
    const min = 1;
    const max = field.precision ? Math.pow(10, field.precision) - 1 : 100000;
    return faker.number.int({ min, max });
  }

  private generateDecimalValue(field: SalesforceField): number {
    const fieldNameLower = field.name.toLowerCase();
    
    // Handle geographic coordinates
    if (fieldNameLower.includes('latitude')) {
      return parseFloat(faker.location.latitude().toFixed(field.scale || 6));
    }
    if (fieldNameLower.includes('longitude')) {
      return parseFloat(faker.location.longitude().toFixed(field.scale || 6));
    }
    
    const min = 0.01;
    const max = field.precision ? Math.pow(10, field.precision - (field.scale || 2)) - 1 : 10000;
    const precision = field.scale || 2;
    return parseFloat(faker.number.float({ min, max, multipleOf: Math.pow(10, -precision) }).toFixed(precision));
  }

  private generateReferenceValue(field: SalesforceField): string | null {
    if (!field.referenceTo || field.referenceTo.length === 0) {
      return null;
    }
    
    // Try to get a reference from our generated data
    for (const referencedObject of field.referenceTo) {
      const referencedRecords = this.referenceStore.get(referencedObject);
      if (referencedRecords && referencedRecords.length > 0) {
        const randomRecord = faker.helpers.arrayElement(referencedRecords);
        const referenceId = randomRecord.Id || this.generateSalesforceId();
        console.log(chalk.gray(`   🔗 ${field.name} linked to ${referencedObject}: ${referenceId}`));
        return referenceId;
      }
    }
    
    // For required fields only, generate a fake ID as fallback
    if (field.required && !field.defaultValue) {
      const fakeId = this.generateSalesforceId();
      console.log(chalk.yellow(`   ⚠️  ${field.name} using fake ID (required, no ${field.referenceTo.join('/')} records): ${fakeId}`));
      return fakeId;
    }
    
    // For optional fields, skip if no reference data available
    console.log(chalk.gray(`   ⏭️  ${field.name} skipped (optional, no ${field.referenceTo.join('/')} records)`));
    return null;
  }

  private generatePicklistFallback(field: SalesforceField): string {
    // Common picklist values for standard fields
    const commonPicklistValues: { [key: string]: string[] } = {
      'status': ['Open', 'In Progress', 'Closed', 'Pending'],
      'priority': ['High', 'Medium', 'Low'],
      'type': ['Customer', 'Partner', 'Competitor', 'Other'],
      'industry': ['Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing'],
      'rating': ['Hot', 'Warm', 'Cold'],
      'source': ['Web', 'Email', 'Phone', 'Referral', 'Advertisement'],
      'stage': ['Prospecting', 'Qualification', 'Needs Analysis', 'Proposal', 'Closed Won', 'Closed Lost']
    };
    
    const fieldNameLower = field.name.toLowerCase();
    for (const [key, values] of Object.entries(commonPicklistValues)) {
      if (fieldNameLower.includes(key)) {
        return faker.helpers.arrayElement(values);
      }
    }
    
    // Fallback to generic values
    return faker.helpers.arrayElement(['Option A', 'Option B', 'Option C']);
  }

  private generateContextualValue(field: SalesforceField, objectName: string): any {
    // Object-specific field generation
    const objectLower = objectName.toLowerCase();
    const fieldLower = field.name.toLowerCase();
    
    if (objectLower === 'opportunity') {
      if (fieldLower.includes('amount')) {
        return faker.number.float({ min: 1000, max: 1000000, precision: 0.01 });
      }
      if (fieldLower.includes('probability')) {
        return faker.number.int({ min: 0, max: 100 });
      }
    }
    
    if (objectLower === 'lead' || objectLower === 'contact') {
      if (fieldLower.includes('score')) {
        return faker.number.int({ min: 0, max: 100 });
      }
    }
    
    // Default fallback
    return faker.lorem.word();
  }

  private generateSalesforceId(): string {
    // Generate a realistic Salesforce ID (15 characters)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 15; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private shouldSkipField(field: SalesforceField): boolean {
    // Skip system fields and calculated fields
    const systemFields = [
      'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
      'SystemModstamp', 'IsDeleted', 'LastActivityDate', 'LastViewedDate',
      'LastReferencedDate', 'OwnerId' // Skip OwnerId as it requires valid User ID
    ];
    
    // Skip compound address fields (these are virtual fields)
    const compoundFields = [
      'BillingAddress', 'ShippingAddress', 'MailingAddress', 'OtherAddress'
    ];
    
    // Skip only problematic address component fields (coordinates and accuracy)
    const problematicAddressFields = [
      'BillingLatitude', 'BillingLongitude', 'BillingGeocodeAccuracy',
      'ShippingLatitude', 'ShippingLongitude', 'ShippingGeocodeAccuracy',
      'MailingLatitude', 'MailingLongitude', 'MailingGeocodeAccuracy',
      'OtherLatitude', 'OtherLongitude', 'OtherGeocodeAccuracy'
    ];
    
    // Skip read-only/restricted fields that commonly cause errors
    const restrictedFields = [
      'PhotoUrl', 'Jigsaw', 'JigsawCompanyId', 'DunsNumber', 'Tradestyle',
      'NaicsCode', 'NaicsDesc', 'YearStarted', 'SicDesc', 'DandbCompanyId'
    ];
    
    // Check basic skip conditions
    if (systemFields.includes(field.name) || 
        compoundFields.includes(field.name) ||
        problematicAddressFields.includes(field.name) ||
        restrictedFields.includes(field.name) ||
        field.calculated || 
        field.autoNumber ||
        field.type === 'address') {
      return true;
    }
    
    // Skip non-createable fields
    if (field.createable === false) {
      return true;
    }
    
    // Skip certain field types that commonly cause issues
    if (field.type === 'base64' || field.type === 'location') {
      return true;
    }
    
    return false;
  }

  private isAddressComponentField(fieldName: string): boolean {
    const fieldNameLower = fieldName.toLowerCase();
    return fieldNameLower.includes('street') ||
           fieldNameLower.includes('city') ||
           fieldNameLower.includes('state') ||
           fieldNameLower.includes('postal') ||
           fieldNameLower.includes('zip') ||
           fieldNameLower.includes('postcode') ||
           fieldNameLower.includes('country');
  }

  private getSkipReason(field: SalesforceField): string {
    const systemFields = [
      'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
      'SystemModstamp', 'IsDeleted', 'LastActivityDate', 'LastViewedDate',
      'LastReferencedDate', 'OwnerId'
    ];
    
    const compoundFields = [
      'BillingAddress', 'ShippingAddress', 'MailingAddress', 'OtherAddress'
    ];
    
    const problematicAddressFields = [
      'BillingLatitude', 'BillingLongitude', 'BillingGeocodeAccuracy',
      'ShippingLatitude', 'ShippingLongitude', 'ShippingGeocodeAccuracy',
      'MailingLatitude', 'MailingLongitude', 'MailingGeocodeAccuracy',
      'OtherLatitude', 'OtherLongitude', 'OtherGeocodeAccuracy'
    ];
    
    const restrictedFields = [
      'PhotoUrl', 'Jigsaw', 'JigsawCompanyId', 'DunsNumber', 'Tradestyle',
      'NaicsCode', 'NaicsDesc', 'YearStarted', 'SicDesc', 'DandbCompanyId'
    ];
    
    if (systemFields.includes(field.name)) return 'system';
    if (compoundFields.includes(field.name)) return 'compound';
    if (problematicAddressFields.includes(field.name)) return 'address-coords';
    if (restrictedFields.includes(field.name)) return 'restricted';
    if (field.calculated) return 'calculated';
    if (field.autoNumber) return 'autonumber';
    if (field.type === 'address') return 'address-type';
    if (field.createable === false) return 'not-createable';
    if (field.type === 'base64' || field.type === 'location') return 'unsupported-type';
    
    return 'unknown';
  }

  private findDependencies(object: SalesforceObject, selectedObjects: string[]): string[] {
    const dependencies: string[] = [];
    
    for (const field of object.fields) {
      if (field.referenceTo && field.referenceTo.length > 0) {
        for (const referencedObject of field.referenceTo) {
          if (selectedObjects.includes(referencedObject) && !dependencies.includes(referencedObject)) {
            dependencies.push(referencedObject);
          }
        }
      }
    }
    
    return dependencies;
  }

  private sortPlanByDependencies(plan: GenerationPlan[]): GenerationPlan[] {
    const sorted: GenerationPlan[] = [];
    const remaining = [...plan];
    const processed = new Set<string>();
    
    while (remaining.length > 0) {
      const canProcess = remaining.filter(item => 
        item.dependencies.every(dep => processed.has(dep))
      );
      
      if (canProcess.length === 0) {
        // Circular dependency or missing dependency - just add remaining items
        sorted.push(...remaining);
        break;
      }
      
      // Add items that can be processed
      canProcess.forEach(item => {
        sorted.push(item);
        processed.add(item.objectName);
        const index = remaining.indexOf(item);
        remaining.splice(index, 1);
      });
    }
    
    return sorted;
  }

  private createExactCounts(
    objects: string[],
    recordsPerObject: number
  ): { [objectName: string]: number } {
    const counts: { [objectName: string]: number } = {};
    for (const objectName of objects) {
      counts[objectName] = recordsPerObject;
    }
    return counts;
  }

  private calculateRecordCounts(
    objects: string[], 
    baseCount: number, 
    sandboxInfo: SandboxInfo
  ): { [objectName: string]: number } {
    const counts: { [objectName: string]: number } = {};
    
    // Calculate storage-safe record limits
    const storageInfo = this.calculateStorageLimits(sandboxInfo);
    console.log(chalk.blue(`📊 Storage Analysis:`));
    console.log(chalk.gray(`   Available Storage: ${storageInfo.availableStorageMB.toFixed(1)}MB`));
    console.log(chalk.gray(`   80% Safe Limit: ${storageInfo.safeStorageMB.toFixed(1)}MB`));
    console.log(chalk.gray(`   Max Safe Records: ${storageInfo.maxSafeRecords} (at 2KB each)`));
    
    // If we don't have enough storage for minimum records, return minimal counts
    if (storageInfo.maxSafeRecords < objects.length) {
      console.log(chalk.yellow(`⚠️  Limited storage: creating 1 record per object`));
      for (const objectName of objects) {
        counts[objectName] = 1;
      }
      return counts;
    }
    
    // Object distribution ratios (relative weights for distributing records)
    const objectRatios: { [key: string]: number } = {
      'Account': 1.0,
      'Contact': 2.5,
      'Lead': 1.5,
      'Opportunity': 0.8,
      'Case': 1.2,
      'Campaign': 0.3,
      'Task': 3.0,
      'Event': 1.0,
      'Product2': 1.0,
      'Pricebook2': 0.2,
      'PricebookEntry': 1.5
    };
    
    // Calculate total ratio weight for selected objects
    let totalRatioWeight = 0;
    for (const objectName of objects) {
      totalRatioWeight += objectRatios[objectName] || 1.0;
    }
    
    // Distribute max safe records proportionally across objects
    let totalAssignedRecords = 0;
    for (const objectName of objects) {
      const ratio = objectRatios[objectName] || 1.0;
      const proportionalRecords = Math.floor((storageInfo.maxSafeRecords * ratio) / totalRatioWeight);
      counts[objectName] = Math.max(1, proportionalRecords); // Minimum 1 record per object
      totalAssignedRecords += counts[objectName];
    }
    
    console.log(chalk.blue(`📊 Record Distribution (${totalAssignedRecords} total records):`));
    for (const objectName of objects) {
      console.log(chalk.gray(`   ${objectName}: ${counts[objectName]} records`));
    }
    console.log(chalk.gray(`   Estimated Storage: ${(totalAssignedRecords * 2 / 1024).toFixed(1)}MB`));
    
    return counts;
  }

  private calculateStorageLimits(sandboxInfo: SandboxInfo): {
    availableStorageMB: number;
    safeStorageMB: number;
    maxSafeRecords: number;
    currentUsagePercent: number;
  } {
    // Calculate available storage
    const currentUsageMB = sandboxInfo.currentDataUsage || 0;
    const totalLimitMB = sandboxInfo.dataStorageLimit;
    const availableStorageMB = totalLimitMB - currentUsageMB;
    
    // Apply 80% safety threshold to available storage
    const safeStorageMB = availableStorageMB * 0.8;
    
    // Convert to KB and calculate max records (2KB per record)
    const safeStorageKB = safeStorageMB * 1024;
    const maxSafeRecords = Math.floor(safeStorageKB / 2); // 2KB per record
    
    const currentUsagePercent = (currentUsageMB / totalLimitMB) * 100;
    
    return {
      availableStorageMB,
      safeStorageMB,
      maxSafeRecords,
      currentUsagePercent
    };
  }

  clearReferenceStore(): void {
    this.referenceStore.clear();
  }

  updateReferenceStoreWithSalesforceIds(objectName: string, successfulRecords: any[]): void {
    // Update the reference store with actual Salesforce IDs from successful insertions
    const records = this.referenceStore.get(objectName) || [];
    const updatedRecords: any[] = [];
    
    successfulRecords.forEach(successfulRecord => {
      if (successfulRecord.recordIndex && successfulRecord.recordId && successfulRecord.recordData) {
        // Create a record with the real Salesforce ID
        const updatedRecord = {
          ...successfulRecord.recordData,
          Id: successfulRecord.recordId
        };
        updatedRecords.push(updatedRecord);
      }
    });
    
    if (updatedRecords.length > 0) {
      this.referenceStore.set(objectName, updatedRecords);
      console.log(chalk.gray(`   📝 Updated reference store for ${objectName} with ${updatedRecords.length} Salesforce IDs`));
    }
  }

  updateReferenceFields(records: any[], objectMeta: SalesforceObject, objectName: string): void {
    // Update reference fields in generated records with actual Salesforce IDs
    const referenceFields = objectMeta.fields.filter(field => field.type === 'reference');
    
    if (referenceFields.length === 0) {
      return;
    }
    
    console.log(chalk.blue(`   🔗 Updating ${referenceFields.length} reference fields for ${objectName}...`));
    
    records.forEach((record, index) => {
      referenceFields.forEach(field => {
        // Skip system fields that should not be populated
        if (this.isSystemField(field.name)) {
          return;
        }
        
        // Skip circular self-references (like Account ParentId → Account)
        if (this.isCircularReference(field.name, objectName, field.referenceTo)) {
          return;
        }
        
        // Only update if the field wasn't populated or has a fake ID
        if (!record[field.name] || this.isFakeSalesforceId(record[field.name])) {
          const newReferenceId = this.generateReferenceValue(field);
          if (newReferenceId) {
            record[field.name] = newReferenceId;
            console.log(chalk.gray(`     Record ${index + 1}: ${field.name} = ${newReferenceId}`));
          }
        }
      });
    });
  }

  private isFakeSalesforceId(id: string): boolean {
    // Check if this looks like a fake ID we generated (vs real Salesforce ID)
    // Fake IDs start with '000' while real Account IDs start with '001', Contact '003', etc.
    return Boolean(id && id.startsWith('000'));
  }

  private isSystemField(fieldName: string): boolean {
    // System fields that should not be populated during data generation
    const systemFields = [
      'OwnerId', 'CreatedById', 'LastModifiedById', 'CreatedDate', 'LastModifiedDate',
      'SystemModstamp', 'MasterRecordId', 'IsDeleted'
    ];
    return systemFields.includes(fieldName);
  }

  private isCircularReference(fieldName: string, objectName: string, referenceTo?: string[]): boolean {
    // Skip circular self-references that are optional (like Account ParentId → Account)
    const circularFields = ['ParentId', 'ReportsToId'];
    return circularFields.includes(fieldName) && 
           Boolean(referenceTo?.includes(objectName));
  }
}