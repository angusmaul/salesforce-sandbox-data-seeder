"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataGenerationService = void 0;
const faker_1 = require("@faker-js/faker");
const chalk_1 = __importDefault(require("chalk"));
class DataGenerationService {
    constructor(locale = 'en', seed) {
        this.referenceStore = new Map();
        // Set locale using faker's setDefaultRefDate method for newer versions
        if (seed) {
            faker_1.faker.seed(seed);
        }
    }
    async createGenerationPlan(selectedObjects, recordsPerObject, sandboxInfo, objects, useExactCounts = false) {
        const plan = [];
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
        }
        else {
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
    generateRecords(salesforceObject, count) {
        const objectName = salesforceObject.name;
        const fields = salesforceObject.fields;
        const records = [];
        // Debug: Log field analysis
        const totalFields = fields.length;
        const skippedFieldsWithReason = [];
        const populatedFields = [];
        console.log(chalk_1.default.blue(`\n📊 Analyzing ${objectName} fields:`));
        console.log(chalk_1.default.blue(`   Total fields: ${totalFields}`));
        for (let i = 0; i < count; i++) {
            const record = {};
            // Handle RecordTypeId only if the object has multiple record types or non-Master record types
            if (salesforceObject.recordTypeInfos && salesforceObject.recordTypeInfos.length > 0) {
                // Check if there are multiple record types or any non-Master record types
                const hasMultipleRecordTypes = salesforceObject.recordTypeInfos.length > 1;
                const hasNonMasterRecordTypes = salesforceObject.recordTypeInfos.some(rt => rt.name !== 'Master');
                if (hasMultipleRecordTypes || hasNonMasterRecordTypes) {
                    const defaultRecordType = salesforceObject.recordTypeInfos.find(rt => rt.defaultRecordTypeMapping && rt.active);
                    if (defaultRecordType) {
                        record.RecordTypeId = defaultRecordType.recordTypeId;
                        if (i === 0)
                            populatedFields.push('RecordTypeId (default)');
                    }
                }
                else {
                    // Only Master record type exists - skip RecordTypeId to let Salesforce handle it automatically
                    if (i === 0)
                        skippedFieldsWithReason.push('RecordTypeId (only Master type)');
                }
            }
            for (const field of fields) {
                // Skip RecordTypeId if we already set it above
                if (field.name === 'RecordTypeId' && record.RecordTypeId) {
                    if (i === 0)
                        skippedFieldsWithReason.push(`${field.name} (already set)`);
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
                    if (i === 0)
                        populatedFields.push(field.name); // Only log on first record
                }
                else {
                    if (i === 0) {
                        // Special debugging for reference fields
                        if (field.type === 'reference' && field.name.includes('Id')) {
                            console.log(chalk_1.default.yellow(`   🐛 DEBUG: ${field.name} (${field.type}) returned null, referenceTo: ${field.referenceTo?.join(',') || 'none'}`));
                        }
                        skippedFieldsWithReason.push(`${field.name} (null value)`);
                    }
                }
            }
            records.push(record);
        }
        // Debug: Show field statistics  
        console.log(chalk_1.default.green(`   ✅ Populated fields (${populatedFields.length}): ${populatedFields.slice(0, 10).join(', ')}${populatedFields.length > 10 ? '...' : ''}`));
        console.log(chalk_1.default.yellow(`   ⏭️  Skipped fields (${skippedFieldsWithReason.length}): ${skippedFieldsWithReason.slice(0, 15).join(', ')}${skippedFieldsWithReason.length > 15 ? '...' : ''}`));
        // Show field type analysis
        const fieldTypeStats = {};
        fields.forEach(field => {
            fieldTypeStats[field.type] = (fieldTypeStats[field.type] || 0) + 1;
        });
        console.log(chalk_1.default.blue(`   📋 Field types found: ${Object.entries(fieldTypeStats).map(([type, count]) => `${type}(${count})`).join(', ')}`));
        // Store generated records for reference in other objects
        this.referenceStore.set(objectName, records);
        return records;
    }
    generateFieldValue(field, objectName, salesforceObject) {
        // Handle required fields vs optional fields
        const isRequired = field.required && !field.defaultValue;
        // For address component fields, always generate data (they're important)
        const isAddressField = this.isAddressComponentField(field.name);
        // For optional fields, skip only 10% of the time to populate more fields (was 20%)
        // But never skip address component fields
        if (!isRequired && !isAddressField && faker_1.faker.datatype.boolean({ probability: 0.1 })) {
            return null;
        }
        // Use default value if available (reduced probability to populate more fields)
        if (field.defaultValue && faker_1.faker.datatype.boolean({ probability: 0.3 })) {
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
                return faker_1.faker.helpers.arrayElement(activeValues).value;
            }
        }
        // Generate value based on Salesforce field type using systematic rules
        return this.generateByFieldType(field, objectName);
    }
    generateByFieldType(field, objectName) {
        const fieldType = field.type.toLowerCase();
        switch (fieldType) {
            // === TEXT-BASED FIELD TYPES ===
            case 'string':
                return this.generateStringValue(field, objectName);
            case 'textarea':
                return this.generateTextAreaValue(field, objectName);
            // === COMMUNICATION FIELD TYPES ===
            case 'email':
                return faker_1.faker.internet.email();
            case 'phone':
                return faker_1.faker.phone.number();
            case 'url':
                return faker_1.faker.internet.url();
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
                return faker_1.faker.datatype.boolean();
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
                console.warn(chalk_1.default.yellow(`⚠️  Unknown field type '${fieldType}' for field '${field.name}', using contextual generation`));
                return this.generateContextualValue(field, objectName);
        }
    }
    generateStringValue(field, objectName) {
        const maxLength = field.length || 255;
        // Generate contextual content based on field name
        const fieldNameLower = field.name.toLowerCase();
        if (fieldNameLower.includes('name')) {
            if (fieldNameLower.includes('first') || fieldNameLower.includes('fname')) {
                return faker_1.faker.person.firstName();
            }
            else if (fieldNameLower.includes('last') || fieldNameLower.includes('lname')) {
                return faker_1.faker.person.lastName();
            }
            else if (fieldNameLower.includes('company') || fieldNameLower.includes('account')) {
                return faker_1.faker.company.name();
            }
            else if (objectName === 'Account' && fieldNameLower === 'name') {
                // Generate business names for Account.Name field
                return faker_1.faker.company.name();
            }
            else {
                return faker_1.faker.person.fullName();
            }
        }
        if (fieldNameLower.includes('title') || fieldNameLower.includes('position')) {
            return faker_1.faker.person.jobTitle();
        }
        if (fieldNameLower.includes('description') || fieldNameLower.includes('notes')) {
            return faker_1.faker.lorem.paragraph().substring(0, maxLength);
        }
        // Handle address component fields specifically and reliably
        if (fieldNameLower.includes('street')) {
            return faker_1.faker.location.streetAddress();
        }
        if (fieldNameLower.includes('city')) {
            return faker_1.faker.location.city();
        }
        if (fieldNameLower.includes('state') || fieldNameLower.includes('province')) {
            return faker_1.faker.location.state();
        }
        if (fieldNameLower.includes('postal') || fieldNameLower.includes('zip') || fieldNameLower.includes('postcode')) {
            return faker_1.faker.location.zipCode();
        }
        if (fieldNameLower.includes('country')) {
            return faker_1.faker.location.country();
        }
        // Handle other address-related fields
        if (fieldNameLower.includes('address') && !['billingaddress', 'shippingaddress', 'mailingaddress', 'otheraddress'].includes(fieldNameLower)) {
            return faker_1.faker.location.streetAddress();
        }
        // Generate random string with appropriate length
        const content = faker_1.faker.lorem.words(3);
        return content.length > maxLength ? content.substring(0, maxLength) : content;
    }
    generateTextAreaValue(field, objectName) {
        const maxLength = field.length || 32000; // Default textarea length
        const fieldNameLower = field.name.toLowerCase();
        if (fieldNameLower.includes('description') || fieldNameLower.includes('notes') || fieldNameLower.includes('comment')) {
            const paragraphs = Math.min(3, Math.floor(maxLength / 200));
            return faker_1.faker.lorem.paragraphs(paragraphs).substring(0, maxLength);
        }
        return faker_1.faker.lorem.paragraph().substring(0, maxLength);
    }
    generateDoubleValue(field) {
        return this.generateDecimalValue(field);
    }
    generateCurrencyValue(field) {
        const min = 0.01;
        const max = field.precision ? Math.pow(10, field.precision - (field.scale || 2)) - 1 : 100000;
        const scale = field.scale || 2;
        return parseFloat(faker_1.faker.number.float({ min, max, multipleOf: Math.pow(10, -scale) }).toFixed(scale));
    }
    generatePercentValue(field) {
        const scale = field.scale || 2;
        return parseFloat(faker_1.faker.number.float({ min: 0, max: 100, multipleOf: Math.pow(10, -scale) }).toFixed(scale));
    }
    generateDateValue(field) {
        return faker_1.faker.date.between({ from: '2020-01-01', to: new Date() }).toISOString().split('T')[0];
    }
    generateDateTimeValue(field) {
        return faker_1.faker.date.between({ from: '2020-01-01', to: new Date() }).toISOString();
    }
    generateTimeValue(field) {
        const date = faker_1.faker.date.recent();
        return date.toTimeString().split(' ')[0]; // HH:MM:SS format
    }
    generatePicklistValue(field) {
        if (field.picklistValues && field.picklistValues.length > 0) {
            const activeValues = field.picklistValues.filter(pv => pv.active);
            if (activeValues.length > 0) {
                return faker_1.faker.helpers.arrayElement(activeValues).value;
            }
        }
        return this.generatePicklistFallback(field);
    }
    generateMultiPicklistValue(field) {
        if (field.picklistValues && field.picklistValues.length > 0) {
            const activeValues = field.picklistValues.filter(pv => pv.active);
            if (activeValues.length > 0) {
                const numValues = faker_1.faker.number.int({ min: 1, max: Math.min(3, activeValues.length) });
                const selectedValues = faker_1.faker.helpers.arrayElements(activeValues, numValues);
                return selectedValues.map(v => v.value).join(';');
            }
        }
        return this.generatePicklistFallback(field);
    }
    generateComboboxValue(field) {
        return this.generatePicklistValue(field); // Combobox is similar to picklist
    }
    generateEncryptedStringValue(field) {
        const maxLength = Math.min(field.length || 175, 175); // Encrypted strings have limits
        return faker_1.faker.lorem.words(3).substring(0, maxLength);
    }
    generateJsonValue(field) {
        return JSON.stringify({
            id: faker_1.faker.number.int({ min: 1, max: 1000 }),
            name: faker_1.faker.lorem.word(),
            active: faker_1.faker.datatype.boolean()
        });
    }
    generateIntegerValue(field) {
        const min = 1;
        const max = field.precision ? Math.pow(10, field.precision) - 1 : 100000;
        return faker_1.faker.number.int({ min, max });
    }
    generateDecimalValue(field) {
        const fieldNameLower = field.name.toLowerCase();
        // Handle geographic coordinates
        if (fieldNameLower.includes('latitude')) {
            return parseFloat(faker_1.faker.location.latitude().toFixed(field.scale || 6));
        }
        if (fieldNameLower.includes('longitude')) {
            return parseFloat(faker_1.faker.location.longitude().toFixed(field.scale || 6));
        }
        const min = 0.01;
        const max = field.precision ? Math.pow(10, field.precision - (field.scale || 2)) - 1 : 10000;
        const precision = field.scale || 2;
        return parseFloat(faker_1.faker.number.float({ min, max, multipleOf: Math.pow(10, -precision) }).toFixed(precision));
    }
    generateReferenceValue(field) {
        if (!field.referenceTo || field.referenceTo.length === 0) {
            return null;
        }
        // Try to get a reference from our generated data
        for (const referencedObject of field.referenceTo) {
            const referencedRecords = this.referenceStore.get(referencedObject);
            if (referencedRecords && referencedRecords.length > 0) {
                const randomRecord = faker_1.faker.helpers.arrayElement(referencedRecords);
                const referenceId = randomRecord.Id || this.generateSalesforceId();
                console.log(chalk_1.default.gray(`   🔗 ${field.name} linked to ${referencedObject}: ${referenceId}`));
                return referenceId;
            }
        }
        // For required fields only, generate a fake ID as fallback
        if (field.required && !field.defaultValue) {
            const fakeId = this.generateSalesforceId();
            console.log(chalk_1.default.yellow(`   ⚠️  ${field.name} using fake ID (required, no ${field.referenceTo.join('/')} records): ${fakeId}`));
            return fakeId;
        }
        // For optional fields, skip if no reference data available
        console.log(chalk_1.default.gray(`   ⏭️  ${field.name} skipped (optional, no ${field.referenceTo.join('/')} records)`));
        return null;
    }
    generatePicklistFallback(field) {
        // Common picklist values for standard fields
        const commonPicklistValues = {
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
                return faker_1.faker.helpers.arrayElement(values);
            }
        }
        // Fallback to generic values
        return faker_1.faker.helpers.arrayElement(['Option A', 'Option B', 'Option C']);
    }
    generateContextualValue(field, objectName) {
        // Object-specific field generation
        const objectLower = objectName.toLowerCase();
        const fieldLower = field.name.toLowerCase();
        if (objectLower === 'opportunity') {
            if (fieldLower.includes('amount')) {
                return faker_1.faker.number.float({ min: 1000, max: 1000000, precision: 0.01 });
            }
            if (fieldLower.includes('probability')) {
                return faker_1.faker.number.int({ min: 0, max: 100 });
            }
        }
        if (objectLower === 'lead' || objectLower === 'contact') {
            if (fieldLower.includes('score')) {
                return faker_1.faker.number.int({ min: 0, max: 100 });
            }
        }
        // Default fallback
        return faker_1.faker.lorem.word();
    }
    generateSalesforceId() {
        // Generate a realistic Salesforce ID (15 characters)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 15; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    shouldSkipField(field) {
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
    isAddressComponentField(fieldName) {
        const fieldNameLower = fieldName.toLowerCase();
        return fieldNameLower.includes('street') ||
            fieldNameLower.includes('city') ||
            fieldNameLower.includes('state') ||
            fieldNameLower.includes('postal') ||
            fieldNameLower.includes('zip') ||
            fieldNameLower.includes('postcode') ||
            fieldNameLower.includes('country');
    }
    getSkipReason(field) {
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
        if (systemFields.includes(field.name))
            return 'system';
        if (compoundFields.includes(field.name))
            return 'compound';
        if (problematicAddressFields.includes(field.name))
            return 'address-coords';
        if (restrictedFields.includes(field.name))
            return 'restricted';
        if (field.calculated)
            return 'calculated';
        if (field.autoNumber)
            return 'autonumber';
        if (field.type === 'address')
            return 'address-type';
        if (field.createable === false)
            return 'not-createable';
        if (field.type === 'base64' || field.type === 'location')
            return 'unsupported-type';
        return 'unknown';
    }
    findDependencies(object, selectedObjects) {
        const dependencies = [];
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
    sortPlanByDependencies(plan) {
        const sorted = [];
        const remaining = [...plan];
        const processed = new Set();
        while (remaining.length > 0) {
            const canProcess = remaining.filter(item => item.dependencies.every(dep => processed.has(dep)));
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
    createExactCounts(objects, recordsPerObject) {
        const counts = {};
        for (const objectName of objects) {
            counts[objectName] = recordsPerObject;
        }
        return counts;
    }
    calculateRecordCounts(objects, baseCount, sandboxInfo) {
        const counts = {};
        // Calculate storage-safe record limits
        const storageInfo = this.calculateStorageLimits(sandboxInfo);
        console.log(chalk_1.default.blue(`📊 Storage Analysis:`));
        console.log(chalk_1.default.gray(`   Available Storage: ${storageInfo.availableStorageMB.toFixed(1)}MB`));
        console.log(chalk_1.default.gray(`   80% Safe Limit: ${storageInfo.safeStorageMB.toFixed(1)}MB`));
        console.log(chalk_1.default.gray(`   Max Safe Records: ${storageInfo.maxSafeRecords} (at 2KB each)`));
        // If we don't have enough storage for minimum records, return minimal counts
        if (storageInfo.maxSafeRecords < objects.length) {
            console.log(chalk_1.default.yellow(`⚠️  Limited storage: creating 1 record per object`));
            for (const objectName of objects) {
                counts[objectName] = 1;
            }
            return counts;
        }
        // Object distribution ratios (relative weights for distributing records)
        const objectRatios = {
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
        console.log(chalk_1.default.blue(`📊 Record Distribution (${totalAssignedRecords} total records):`));
        for (const objectName of objects) {
            console.log(chalk_1.default.gray(`   ${objectName}: ${counts[objectName]} records`));
        }
        console.log(chalk_1.default.gray(`   Estimated Storage: ${(totalAssignedRecords * 2 / 1024).toFixed(1)}MB`));
        return counts;
    }
    calculateStorageLimits(sandboxInfo) {
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
    clearReferenceStore() {
        this.referenceStore.clear();
    }
    updateReferenceStoreWithSalesforceIds(objectName, successfulRecords) {
        // Update the reference store with actual Salesforce IDs from successful insertions
        const records = this.referenceStore.get(objectName) || [];
        const updatedRecords = [];
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
            console.log(chalk_1.default.gray(`   📝 Updated reference store for ${objectName} with ${updatedRecords.length} Salesforce IDs`));
        }
    }
    updateReferenceFields(records, objectMeta, objectName) {
        // Update reference fields in generated records with actual Salesforce IDs
        const referenceFields = objectMeta.fields.filter(field => field.type === 'reference');
        if (referenceFields.length === 0) {
            return;
        }
        console.log(chalk_1.default.blue(`   🔗 Updating ${referenceFields.length} reference fields for ${objectName}...`));
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
                        console.log(chalk_1.default.gray(`     Record ${index + 1}: ${field.name} = ${newReferenceId}`));
                    }
                }
            });
        });
    }
    isFakeSalesforceId(id) {
        // Check if this looks like a fake ID we generated (vs real Salesforce ID)
        // Fake IDs start with '000' while real Account IDs start with '001', Contact '003', etc.
        return Boolean(id && id.startsWith('000'));
    }
    isSystemField(fieldName) {
        // System fields that should not be populated during data generation
        const systemFields = [
            'OwnerId', 'CreatedById', 'LastModifiedById', 'CreatedDate', 'LastModifiedDate',
            'SystemModstamp', 'MasterRecordId', 'IsDeleted'
        ];
        return systemFields.includes(fieldName);
    }
    isCircularReference(fieldName, objectName, referenceTo) {
        // Skip circular self-references that are optional (like Account ParentId → Account)
        const circularFields = ['ParentId', 'ReportsToId'];
        return circularFields.includes(fieldName) &&
            Boolean(referenceTo?.includes(objectName));
    }
}
exports.DataGenerationService = DataGenerationService;
//# sourceMappingURL=data-generator.js.map