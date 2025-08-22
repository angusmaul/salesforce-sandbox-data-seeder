/**
 * Schema Anonymizer
 * 
 * Anonymizes Salesforce schema data before sending to Claude API
 * to protect sensitive organizational information while preserving
 * structure for AI analysis.
 */

const crypto = require('crypto');

/**
 * Anonymize a Salesforce object schema
 * @param {Object} objectSchema - The Salesforce object schema
 * @param {Object} options - Anonymization options
 * @returns {Object} Anonymized schema
 */
function anonymizeObjectSchema(objectSchema, options = {}) {
    const {
        preserveStandardObjects = true,
        preserveStandardFields = true,
        includeFieldTypes = true,
        includeValidationRules = true,
        seedValue = 'default'
    } = options;

    // Create a deterministic anonymization map for consistent results
    const objectMap = new Map();
    const fieldMap = new Map();
    
    const anonymized = {
        ...objectSchema,
        name: anonymizeObjectName(objectSchema.name, objectMap, preserveStandardObjects, seedValue),
        apiName: anonymizeObjectName(objectSchema.apiName, objectMap, preserveStandardObjects, seedValue),
        label: anonymizeLabel(objectSchema.label, objectSchema.name, preserveStandardObjects),
        labelPlural: anonymizeLabel(objectSchema.labelPlural, objectSchema.name, preserveStandardObjects),
        keyPrefix: objectSchema.keyPrefix ? 'xxx' : undefined, // Mask key prefix
        fields: objectSchema.fields ? objectSchema.fields.map(field => 
            anonymizeField(field, fieldMap, preserveStandardFields, includeFieldTypes, seedValue)
        ) : [],
        childRelationships: objectSchema.childRelationships ? objectSchema.childRelationships.map(rel =>
            anonymizeChildRelationship(rel, objectMap, fieldMap, preserveStandardObjects, preserveStandardFields, seedValue)
        ) : [],
        validationRules: includeValidationRules && objectSchema.validationRules ? 
            objectSchema.validationRules.map(rule => 
                anonymizeValidationRule(rule, fieldMap, preserveStandardFields, seedValue)
            ) : [],
        schemaAnalysis: objectSchema.schemaAnalysis ? 
            anonymizeSchemaAnalysis(objectSchema.schemaAnalysis, fieldMap, preserveStandardFields, seedValue) : undefined,
        // Mark as anonymized
        _anonymized: true,
        _originalObjectName: preserveStandardObjects && isStandardObject(objectSchema.name) ? objectSchema.name : undefined
    };

    return anonymized;
}

/**
 * Anonymize object name
 */
function anonymizeObjectName(objectName, objectMap, preserveStandard, seed) {
    if (preserveStandard && isStandardObject(objectName)) {
        return objectName;
    }
    
    if (objectMap.has(objectName)) {
        return objectMap.get(objectName);
    }
    
    const anonymized = objectName.endsWith('__c') ? 
        `CustomObject_${generateHash(objectName, seed, 6)}__c` :
        `Object_${generateHash(objectName, seed, 6)}`;
    
    objectMap.set(objectName, anonymized);
    return anonymized;
}

/**
 * Anonymize field information
 */
function anonymizeField(field, fieldMap, preserveStandard, includeTypes, seed) {
    const anonymized = {
        name: anonymizeFieldName(field.name, fieldMap, preserveStandard, seed),
        apiName: anonymizeFieldName(field.apiName, fieldMap, preserveStandard, seed),
        label: anonymizeLabel(field.label, field.name, preserveStandard && isStandardField(field.name)),
        required: field.required,
        unique: field.unique,
        createable: field.createable,
        updateable: field.updateable,
        calculated: field.calculated,
        autoNumber: field.autoNumber
    };

    // Include type information based on options
    if (includeTypes) {
        anonymized.type = field.type;
        anonymized.length = field.length;
        anonymized.precision = field.precision;
        anonymized.scale = field.scale;
    }

    // Anonymize reference information
    if (field.referenceTo && field.referenceTo.length > 0) {
        anonymized.referenceTo = field.referenceTo.map(ref => 
            preserveStandard && isStandardObject(ref) ? ref : `RefObject_${generateHash(ref, seed, 6)}`
        );
        anonymized.relationshipName = field.relationshipName ? 
            `Relationship_${generateHash(field.relationshipName, seed, 6)}` : undefined;
    }

    // Anonymize picklist values (preserve structure but anonymize labels)
    if (field.picklistValues && field.picklistValues.length > 0) {
        anonymized.picklistValues = field.picklistValues.map((pv, index) => ({
            label: `Option_${index + 1}`,
            value: pv.value, // Keep actual values for structure analysis
            active: pv.active,
            defaultValue: pv.defaultValue
        }));
    }

    return anonymized;
}

/**
 * Anonymize field name
 */
function anonymizeFieldName(fieldName, fieldMap, preserveStandard, seed) {
    if (preserveStandard && isStandardField(fieldName)) {
        return fieldName;
    }
    
    if (fieldMap.has(fieldName)) {
        return fieldMap.get(fieldName);
    }
    
    let anonymized;
    if (fieldName.endsWith('__c')) {
        anonymized = `CustomField_${generateHash(fieldName, seed, 6)}__c`;
    } else if (fieldName.endsWith('__r')) {
        anonymized = `RelationshipField_${generateHash(fieldName, seed, 6)}__r`;
    } else {
        anonymized = `Field_${generateHash(fieldName, seed, 6)}`;
    }
    
    fieldMap.set(fieldName, anonymized);
    return anonymized;
}

/**
 * Anonymize child relationship
 */
function anonymizeChildRelationship(relationship, objectMap, fieldMap, preserveStandardObjects, preserveStandardFields, seed) {
    return {
        field: anonymizeFieldName(relationship.field, fieldMap, preserveStandardFields, seed),
        childSObject: anonymizeObjectName(relationship.childSObject, objectMap, preserveStandardObjects, seed),
        relationshipName: relationship.relationshipName ? 
            `ChildRelationship_${generateHash(relationship.relationshipName, seed, 6)}` : undefined
    };
}

/**
 * Anonymize validation rule
 */
function anonymizeValidationRule(validationRule, fieldMap, preserveStandardFields, seed) {
    return {
        id: generateHash(validationRule.id, seed, 12),
        fullName: `ValidationRule_${generateHash(validationRule.fullName, seed, 8)}`,
        active: validationRule.active,
        description: validationRule.description ? 'Anonymized validation rule description' : undefined,
        errorConditionFormula: anonymizeFormula(validationRule.errorConditionFormula, fieldMap, preserveStandardFields, seed),
        errorMessage: 'Anonymized error message',
        errorDisplayField: validationRule.errorDisplayField ? 
            anonymizeFieldName(validationRule.errorDisplayField, fieldMap, preserveStandardFields, seed) : undefined,
        validationName: `Validation_${generateHash(validationRule.validationName, seed, 8)}`,
        fields: validationRule.fields ? validationRule.fields.map(field => 
            anonymizeFieldName(field, fieldMap, preserveStandardFields, seed)
        ) : undefined,
        dependencies: validationRule.dependencies ? validationRule.dependencies.map(dep => 
            anonymizeFieldDependency(dep, fieldMap, preserveStandardFields, seed)
        ) : undefined,
        complexity: validationRule.complexity,
        riskLevel: validationRule.riskLevel
    };
}

/**
 * Anonymize formula while preserving structure
 */
function anonymizeFormula(formula, fieldMap, preserveStandardFields, seed) {
    if (!formula) return formula;
    
    let anonymizedFormula = formula;
    
    // Replace field references while preserving formula structure
    const fieldPattern = /\b([A-Za-z][A-Za-z0-9_]*(__c|__r)?)\b/g;
    const matches = [...formula.matchAll(fieldPattern)];
    
    // Create a replacement map to avoid conflicts
    const replacements = new Map();
    
    matches.forEach(match => {
        const fieldName = match[1];
        if (!isFormulaFunction(fieldName) && !isConstant(fieldName)) {
            const anonymizedField = anonymizeFieldName(fieldName, fieldMap, preserveStandardFields, seed);
            replacements.set(fieldName, anonymizedField);
        }
    });
    
    // Apply replacements
    replacements.forEach((anonymizedField, originalField) => {
        const regex = new RegExp(`\\b${escapeRegex(originalField)}\\b`, 'g');
        anonymizedFormula = anonymizedFormula.replace(regex, anonymizedField);
    });
    
    return anonymizedFormula;
}

/**
 * Anonymize field dependency
 */
function anonymizeFieldDependency(dependency, fieldMap, preserveStandardFields, seed) {
    return {
        sourceField: anonymizeFieldName(dependency.sourceField, fieldMap, preserveStandardFields, seed),
        targetField: anonymizeFieldName(dependency.targetField, fieldMap, preserveStandardFields, seed),
        type: dependency.type,
        condition: dependency.condition,
        operator: dependency.operator,
        value: dependency.value
    };
}

/**
 * Anonymize schema analysis
 */
function anonymizeSchemaAnalysis(analysis, fieldMap, preserveStandardFields, seed) {
    return {
        objectName: `AnalyzedObject_${generateHash(analysis.objectName, seed, 8)}`,
        validationRules: analysis.validationRules ? analysis.validationRules.map(rule => 
            anonymizeValidationRule(rule, fieldMap, preserveStandardFields, seed)
        ) : [],
        fieldConstraints: analysis.fieldConstraints ? analysis.fieldConstraints.map(constraint => ({
            field: anonymizeFieldName(constraint.field, fieldMap, preserveStandardFields, seed),
            type: constraint.type,
            constraint: constraint.constraint,
            validationRule: constraint.validationRule ? generateHash(constraint.validationRule, seed, 12) : undefined,
            errorMessage: constraint.errorMessage ? 'Anonymized error message' : undefined,
            severity: constraint.severity
        })) : [],
        fieldDependencies: analysis.fieldDependencies ? analysis.fieldDependencies.map(dep => 
            anonymizeFieldDependency(dep, fieldMap, preserveStandardFields, seed)
        ) : [],
        requiredFieldPatterns: analysis.requiredFieldPatterns || [],
        complexityScore: analysis.complexityScore,
        riskFactors: analysis.riskFactors || [],
        recommendations: analysis.recommendations || [],
        anonymized: true,
        analysisTimestamp: analysis.analysisTimestamp
    };
}

/**
 * Anonymize label while preserving some meaning
 */
function anonymizeLabel(label, originalName, preserveStandard) {
    if (preserveStandard && (isStandardObject(originalName) || isStandardField(originalName))) {
        return label;
    }
    
    // Create generic but meaningful labels
    if (originalName.endsWith('__c')) {
        return 'Custom Field Label';
    } else if (originalName.includes('_')) {
        return 'Business Field Label';
    } else {
        return 'Field Label';
    }
}

/**
 * Check if object is a standard Salesforce object
 */
function isStandardObject(objectName) {
    const standardObjects = [
        'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Campaign', 
        'User', 'Product2', 'Pricebook2', 'PricebookEntry', 'OpportunityLineItem',
        'Asset', 'Contract', 'Order', 'OrderItem', 'Quote', 'QuoteLineItem',
        'Task', 'Event', 'EmailMessage', 'Attachment', 'Document', 'ContentDocument',
        'ContentVersion', 'Knowledge__kav', 'Solution', 'Idea', 'Dashboard',
        'Report', 'Organization'
    ];
    return standardObjects.includes(objectName);
}

/**
 * Check if field is a standard Salesforce field
 */
function isStandardField(fieldName) {
    const standardFields = [
        'Id', 'Name', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
        'SystemModstamp', 'IsDeleted', 'OwnerId', 'Type', 'AccountId', 'ContactId',
        'LeadId', 'OpportunityId', 'CaseId', 'CampaignId', 'Subject', 'Status',
        'Priority', 'Description', 'Amount', 'CloseDate', 'StageName', 'Probability',
        'Email', 'Phone', 'FirstName', 'LastName', 'Title', 'Company', 'Website',
        'Industry', 'AnnualRevenue', 'NumberOfEmployees', 'BillingAddress',
        'ShippingAddress', 'BillingStreet', 'BillingCity', 'BillingState',
        'BillingPostalCode', 'BillingCountry'
    ];
    return standardFields.includes(fieldName);
}

/**
 * Check if token is a formula function (reused from validation parser)
 */
function isFormulaFunction(token) {
    const functions = [
        'ABS', 'ADDMONTHS', 'AND', 'BEGINS', 'BLANKVALUE', 'CASE', 'CEILING',
        'CONTAINS', 'DATE', 'DATEVALUE', 'DATETIME', 'DATETIMEVALUE', 'DAY',
        'EXP', 'FIND', 'FLOOR', 'IF', 'INCLUDE', 'ISBLANK', 'ISNULL', 'ISNUMBER',
        'LEFT', 'LEN', 'LN', 'LOG', 'LOWER', 'LPAD', 'MAX', 'MID', 'MIN', 'MOD',
        'MONTH', 'NOT', 'NOW', 'OR', 'POWER', 'RIGHT', 'ROUND', 'RPAD', 'SQRT',
        'SUBSTITUTE', 'TEXT', 'TODAY', 'TRIM', 'UPPER', 'VALUE', 'WEEKDAY', 'YEAR',
        'ISPICKVAL', 'PRIORVALUE', 'REGEX', 'TRUE', 'FALSE'
    ];
    return functions.includes(token.toUpperCase());
}

/**
 * Check if token is a constant
 */
function isConstant(token) {
    return /^(\d+\.?\d*|"[^"]*"|'[^']*'|true|false|null)$/i.test(token);
}

/**
 * Generate deterministic hash
 */
function generateHash(input, seed, length = 8) {
    const hash = crypto.createHash('sha256');
    hash.update(seed + input);
    return hash.digest('hex').substring(0, length);
}

/**
 * Escape regex special characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create anonymization summary for Claude API
 */
function createAnonymizationSummary(originalSchema, anonymizedSchema) {
    return {
        objectName: anonymizedSchema.name,
        originalObjectType: originalSchema.custom ? 'custom' : 'standard',
        fieldCount: anonymizedSchema.fields.length,
        customFieldCount: anonymizedSchema.fields.filter(f => f.name.endsWith('__c')).length,
        validationRuleCount: anonymizedSchema.validationRules ? anonymizedSchema.validationRules.length : 0,
        relationshipCount: anonymizedSchema.fields.filter(f => f.referenceTo && f.referenceTo.length > 0).length,
        complexityIndicators: {
            hasValidationRules: (anonymizedSchema.validationRules || []).length > 0,
            hasLookupFields: anonymizedSchema.fields.some(f => f.referenceTo && f.referenceTo.length > 0),
            hasRequiredFields: anonymizedSchema.fields.some(f => f.required),
            hasUniqueFields: anonymizedSchema.fields.some(f => f.unique),
            hasFormulas: anonymizedSchema.fields.some(f => f.calculated)
        },
        preservationNote: 'Schema structure and validation logic preserved, sensitive names anonymized'
    };
}

module.exports = {
    anonymizeObjectSchema,
    anonymizeValidationRule,
    anonymizeFormula,
    createAnonymizationSummary,
    isStandardObject,
    isStandardField
};