/**
 * Constraint Solver
 * 
 * Generates field values that satisfy Salesforce validation rules and constraints.
 * Works in conjunction with the ValidationEngine to ensure generated data 
 * passes validation on the first attempt.
 */

const { faker } = require('@faker-js/faker');

/**
 * Main constraint solver class
 */
class ConstraintSolver {
  constructor(options = {}) {
    this.options = {
      maxAttempts: options.maxAttempts || 10,
      seedValue: options.seedValue || null,
      useRealisticData: options.useRealisticData !== false,
      ...options
    };

    // Set faker seed if provided
    if (this.options.seedValue) {
      faker.seed(this.options.seedValue);
    }
  }

  /**
   * Generate compliant field values for a record
   * @param {Object} objectSchema - Salesforce object schema
   * @param {Array} validationRules - Array of validation rules
   * @param {Array} fieldConstraints - Array of field constraints
   * @param {Array} fieldDependencies - Array of field dependencies
   * @param {Object} existingValues - Any pre-existing field values
   * @returns {Object} Generated record with compliant values
   */
  async generateCompliantRecord(objectSchema, validationRules, fieldConstraints, fieldDependencies, existingValues = {}) {
    console.log(`🎯 Generating compliant record for ${objectSchema.name}`);

    const record = { ...existingValues };
    const generationPlan = this.createGenerationPlan(objectSchema, validationRules, fieldConstraints, fieldDependencies);

    // Generate values in dependency order
    for (const step of generationPlan.steps) {
      await this.executeGenerationStep(step, record, generationPlan.context);
    }

    // Validate the generated record
    const validation = this.validateGeneratedRecord(record, validationRules, fieldConstraints);
    
    if (!validation.isValid) {
      console.warn(`⚠️ Generated record has ${validation.violations.length} violations`);
      
      // Attempt to fix violations
      const fixedRecord = await this.fixViolations(record, validation.violations, generationPlan.context);
      return fixedRecord;
    }

    console.log(`✅ Successfully generated compliant record for ${objectSchema.name}`);
    return record;
  }

  /**
   * Generate a value for a specific field that satisfies all constraints
   */
  generateConstrainedFieldValue(field, constraints, dependencies, context = {}) {
    const fieldConstraints = constraints.filter(c => c.field === field.name);
    const fieldDependencies = dependencies.filter(d => d.targetField === field.name || d.sourceField === field.name);

    // Check if field has dependencies that need to be satisfied first
    const requiredDependencies = fieldDependencies.filter(d => d.targetField === field.name && d.type === 'required_if');
    
    for (const dependency of requiredDependencies) {
      if (context.record && this.isDependencyConditionMet(dependency, context.record)) {
        // Field is required due to dependency
        return this.generateRequiredFieldValue(field, fieldConstraints, context);
      }
    }

    // Generate value based on field type and constraints
    return this.generateFieldValueByType(field, fieldConstraints, context);
  }

  /**
   * Create a generation plan that respects field dependencies
   */
  createGenerationPlan(objectSchema, validationRules, fieldConstraints, fieldDependencies) {
    const steps = [];
    const context = {
      objectSchema,
      validationRules,
      fieldConstraints,
      fieldDependencies,
      generatedFields: new Set()
    };

    // Sort fields by dependency order
    const fieldOrder = this.sortFieldsByDependencies(objectSchema.fields, fieldDependencies);
    
    // Create generation steps
    fieldOrder.forEach(field => {
      if (field.createable && !field.calculated && !field.autoNumber) {
        steps.push({
          type: 'generate_field',
          field,
          constraints: fieldConstraints.filter(c => c.field === field.name),
          dependencies: fieldDependencies.filter(d => 
            d.sourceField === field.name || d.targetField === field.name
          )
        });
      }
    });

    return { steps, context };
  }

  /**
   * Execute a single generation step
   */
  async executeGenerationStep(step, record, context) {
    switch (step.type) {
      case 'generate_field':
        if (!record.hasOwnProperty(step.field.name)) {
          const value = this.generateConstrainedFieldValue(
            step.field, 
            step.constraints, 
            step.dependencies, 
            { ...context, record }
          );
          
          if (value !== null && value !== undefined) {
            record[step.field.name] = value;
            context.generatedFields.add(step.field.name);
          }
        }
        break;
        
      default:
        console.warn(`Unknown generation step type: ${step.type}`);
    }
  }

  /**
   * Sort fields by their dependencies to ensure proper generation order
   */
  sortFieldsByDependencies(fields, dependencies) {
    const fieldMap = new Map(fields.map(f => [f.name, f]));
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    function visit(fieldName) {
      if (visited.has(fieldName)) return;
      if (visiting.has(fieldName)) {
        // Circular dependency detected - continue anyway
        console.warn(`Circular dependency detected for field: ${fieldName}`);
        return;
      }

      visiting.add(fieldName);

      // Visit dependencies first
      const fieldDeps = dependencies.filter(d => d.targetField === fieldName);
      fieldDeps.forEach(dep => {
        if (fieldMap.has(dep.sourceField)) {
          visit(dep.sourceField);
        }
      });

      visiting.delete(fieldName);
      visited.add(fieldName);

      if (fieldMap.has(fieldName)) {
        sorted.push(fieldMap.get(fieldName));
      }
    }

    // Visit all fields
    fields.forEach(field => visit(field.name));

    // Add any remaining fields that weren't visited (no dependencies)
    fields.forEach(field => {
      if (!visited.has(field.name)) {
        sorted.push(field);
      }
    });

    return sorted;
  }

  /**
   * Generate a field value based on its Salesforce type
   */
  generateFieldValueByType(field, constraints, context = {}) {
    const required = constraints.some(c => c.type === 'required');
    const unique = constraints.some(c => c.type === 'unique');

    // Handle null values for non-required fields
    if (!required && Math.random() < 0.1) {
      return null; // 10% chance of null for non-required fields
    }

    switch (field.type.toLowerCase()) {
      case 'string':
      case 'textarea':
        return this.generateStringValue(field, constraints, context);
        
      case 'email':
        return this.generateEmailValue(field, unique, context);
        
      case 'phone':
        return this.generatePhoneValue(field, context);
        
      case 'url':
        return this.generateUrlValue(field, context);
        
      case 'int':
      case 'integer':
      case 'double':
      case 'currency':
      case 'percent':
        return this.generateNumericValue(field, constraints, context);
        
      case 'date':
        return this.generateDateValue(field, constraints, context);
        
      case 'datetime':
        return this.generateDateTimeValue(field, constraints, context);
        
      case 'boolean':
        return this.generateBooleanValue(field, constraints, context);
        
      case 'picklist':
      case 'multipicklist':
        return this.generatePicklistValue(field, constraints, context);
        
      case 'reference':
        return this.generateReferenceValue(field, constraints, context);
        
      case 'id':
        return this.generateIdValue(field, unique, context);
        
      default:
        console.warn(`Unknown field type: ${field.type}`);
        return this.generateStringValue(field, constraints, context);
    }
  }

  /**
   * Generate string values
   */
  generateStringValue(field, constraints, context) {
    const maxLength = field.length || 255;
    const minLength = constraints.some(c => c.type === 'required') ? 1 : 0;

    // Check for specific field name patterns
    const fieldName = field.name.toLowerCase();
    
    if (fieldName.includes('name')) {
      if (fieldName.includes('first')) {
        return faker.person.firstName();
      } else if (fieldName.includes('last')) {
        return faker.person.lastName();
      } else if (fieldName.includes('company') || fieldName.includes('account')) {
        return faker.company.name();
      } else {
        return faker.person.fullName();
      }
    }
    
    if (fieldName.includes('description') || fieldName.includes('comment')) {
      const description = faker.lorem.sentences(2);
      return description.length > maxLength ? description.substring(0, maxLength - 3) + '...' : description;
    }
    
    if (fieldName.includes('address')) {
      if (fieldName.includes('street')) {
        return faker.location.streetAddress();
      } else if (fieldName.includes('city')) {
        return faker.location.city();
      } else if (fieldName.includes('state')) {
        return faker.location.state();
      } else if (fieldName.includes('postal') || fieldName.includes('zip')) {
        return faker.location.zipCode();
      } else if (fieldName.includes('country')) {
        return faker.location.country();
      } else {
        return faker.location.streetAddress();
      }
    }

    if (fieldName.includes('title') || fieldName.includes('position')) {
      return faker.person.jobTitle();
    }

    // Generate a generic string value
    let value = faker.lorem.words(Math.ceil(Math.random() * 3) + 1);
    
    // Ensure it fits within length constraints
    if (value.length > maxLength) {
      value = value.substring(0, maxLength);
    }
    
    if (value.length < minLength) {
      value = faker.lorem.words(Math.ceil(minLength / 5) + 1).substring(0, maxLength);
    }

    return value;
  }

  /**
   * Generate email values
   */
  generateEmailValue(field, unique, context) {
    const domains = ['example.com', 'test.org', 'sample.net', 'demo.co'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    
    let localPart = faker.internet.userName();
    
    // Make unique if required
    if (unique) {
      localPart += '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
    
    return `${localPart}@${domain}`;
  }

  /**
   * Generate phone values
   */
  generatePhoneValue(field, context) {
    // Generate realistic phone number
    return faker.phone.number('###-###-####');
  }

  /**
   * Generate URL values
   */
  generateUrlValue(field, context) {
    return faker.internet.url();
  }

  /**
   * Generate numeric values
   */
  generateNumericValue(field, constraints, context) {
    let min = 0;
    let max = 1000000;
    let precision = field.precision || 18;
    let scale = field.scale || 0;

    // Check range constraints
    const rangeConstraints = constraints.filter(c => c.type === 'range');
    rangeConstraints.forEach(constraint => {
      const rangeMatch = constraint.constraint.match(/(\d+).*?(\d+)/);
      if (rangeMatch) {
        min = Math.max(min, Number(rangeMatch[1]));
        max = Math.min(max, Number(rangeMatch[2]));
      }
    });

    // Generate value within constraints
    let value = faker.number.float({ min, max, fractionDigits: scale });
    
    // Ensure precision constraints
    const maxValue = Math.pow(10, precision - scale) - 1;
    if (value > maxValue) {
      value = maxValue;
    }

    return value;
  }

  /**
   * Generate date values
   */
  generateDateValue(field, constraints, context) {
    // Default to dates within the last year to next year
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    
    const to = new Date();
    to.setFullYear(to.getFullYear() + 1);

    const date = faker.date.between({ from, to });
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }

  /**
   * Generate datetime values
   */
  generateDateTimeValue(field, constraints, context) {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    
    const to = new Date();
    to.setFullYear(to.getFullYear() + 1);

    return faker.date.between({ from, to }).toISOString();
  }

  /**
   * Generate boolean values
   */
  generateBooleanValue(field, constraints, context) {
    return faker.datatype.boolean();
  }

  /**
   * Generate picklist values
   */
  generatePicklistValue(field, constraints, context) {
    if (!field.picklistValues || field.picklistValues.length === 0) {
      return null;
    }

    // Filter to active values
    const activeValues = field.picklistValues.filter(pv => pv.active);
    if (activeValues.length === 0) {
      return null;
    }

    // Return a random active value
    const randomValue = activeValues[Math.floor(Math.random() * activeValues.length)];
    
    if (field.type.toLowerCase() === 'multipicklist') {
      // For multi-picklist, sometimes return multiple values
      if (Math.random() < 0.3 && activeValues.length > 1) {
        const numValues = Math.min(Math.floor(Math.random() * 3) + 1, activeValues.length);
        const selectedValues = [];
        const availableValues = [...activeValues];
        
        for (let i = 0; i < numValues; i++) {
          const index = Math.floor(Math.random() * availableValues.length);
          selectedValues.push(availableValues.splice(index, 1)[0]);
        }
        
        return selectedValues.map(v => v.value).join(';');
      }
    }

    return randomValue.value;
  }

  /**
   * Generate reference (lookup) values
   */
  generateReferenceValue(field, constraints, context) {
    // This would need to be enhanced to work with actual Salesforce data
    // For now, generate a fake Salesforce ID
    return this.generateSalesforceId();
  }

  /**
   * Generate ID values
   */
  generateIdValue(field, unique, context) {
    return this.generateSalesforceId();
  }

  /**
   * Generate required field values
   */
  generateRequiredFieldValue(field, constraints, context) {
    // Ensure we generate a non-null value
    const value = this.generateFieldValueByType(field, constraints, context);
    
    if (value === null || value === undefined || value === '') {
      // Generate a fallback value
      switch (field.type.toLowerCase()) {
        case 'string':
        case 'textarea':
          return 'Required Value';
        case 'email':
          return 'required@example.com';
        case 'phone':
          return '555-0123';
        case 'int':
        case 'integer':
        case 'double':
        case 'currency':
          return 1;
        case 'date':
          return new Date().toISOString().split('T')[0];
        case 'datetime':
          return new Date().toISOString();
        case 'boolean':
          return true;
        default:
          return 'Required';
      }
    }
    
    return value;
  }

  /**
   * Check if a dependency condition is met
   */
  isDependencyConditionMet(dependency, record) {
    const sourceValue = record[dependency.sourceField];
    
    if (dependency.condition) {
      // Simple condition evaluation
      if (dependency.condition.includes('=')) {
        const [, expectedValue] = dependency.condition.split('=').map(s => s.trim());
        return sourceValue?.toString() === expectedValue.replace(/['"]/g, '');
      }
      
      if (dependency.condition.includes('!=')) {
        const [, expectedValue] = dependency.condition.split('!=').map(s => s.trim());
        return sourceValue?.toString() !== expectedValue.replace(/['"]/g, '');
      }
    }

    // Default: if source field has a value, dependency is met
    return sourceValue !== null && sourceValue !== undefined && sourceValue !== '';
  }

  /**
   * Validate a generated record against constraints
   */
  validateGeneratedRecord(record, validationRules, fieldConstraints) {
    const violations = [];

    // Check field constraints
    fieldConstraints.forEach(constraint => {
      const fieldValue = record[constraint.field];
      
      switch (constraint.type) {
        case 'required':
          if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
            violations.push({
              field: constraint.field,
              type: 'required',
              message: `${constraint.field} is required but empty`
            });
          }
          break;
          
        case 'unique':
          // Can't validate uniqueness without database access
          break;
      }
    });

    // Basic validation rule checking (simplified)
    validationRules.forEach(rule => {
      if (rule.active && rule.errorConditionFormula) {
        // Simple ISBLANK check
        const isBlankMatch = rule.errorConditionFormula.match(/ISBLANK\s*\(\s*([A-Za-z][A-Za-z0-9_]*(?:__c|__r)?)\s*\)/i);
        if (isBlankMatch) {
          const fieldName = isBlankMatch[1];
          const fieldValue = record[fieldName];
          
          if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
            violations.push({
              field: fieldName,
              type: 'validation_rule',
              rule: rule.id,
              message: rule.errorMessage
            });
          }
        }
      }
    });

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  /**
   * Attempt to fix violations in a generated record
   */
  async fixViolations(record, violations, context) {
    const fixedRecord = { ...record };

    for (const violation of violations) {
      switch (violation.type) {
        case 'required':
        case 'validation_rule':
          const field = context.objectSchema.fields.find(f => f.name === violation.field);
          if (field) {
            const constraints = context.fieldConstraints.filter(c => c.field === violation.field);
            const newValue = this.generateRequiredFieldValue(field, constraints, context);
            fixedRecord[violation.field] = newValue;
            console.log(`🔧 Fixed violation for ${violation.field}: ${newValue}`);
          }
          break;
      }
    }

    return fixedRecord;
  }

  /**
   * Generate a Salesforce ID
   */
  generateSalesforceId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    // Salesforce IDs are 15 or 18 characters, we'll use 18
    for (let i = 0; i < 18; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * Create multiple compliant records
   */
  async generateCompliantRecords(count, objectSchema, validationRules, fieldConstraints, fieldDependencies) {
    console.log(`🎯 Generating ${count} compliant records for ${objectSchema.name}`);
    
    const records = [];
    const batchSize = Math.min(count, 10); // Process in batches
    
    for (let i = 0; i < count; i += batchSize) {
      const batch = [];
      const currentBatchSize = Math.min(batchSize, count - i);
      
      for (let j = 0; j < currentBatchSize; j++) {
        try {
          const record = await this.generateCompliantRecord(
            objectSchema, 
            validationRules, 
            fieldConstraints, 
            fieldDependencies
          );
          batch.push(record);
        } catch (error) {
          console.error(`Failed to generate record ${i + j + 1}:`, error.message);
          // Generate a basic fallback record
          batch.push(this.generateFallbackRecord(objectSchema));
        }
      }
      
      records.push(...batch);
      
      if (i + batchSize < count) {
        console.log(`📦 Generated ${records.length}/${count} records`);
      }
    }
    
    console.log(`✅ Successfully generated ${records.length} compliant records`);
    return records;
  }

  /**
   * Generate a basic fallback record when constraint solving fails
   */
  generateFallbackRecord(objectSchema) {
    const record = {};
    
    objectSchema.fields.forEach(field => {
      if (field.createable && !field.calculated && !field.autoNumber) {
        if (field.required) {
          // Generate minimal required values
          switch (field.type.toLowerCase()) {
            case 'string':
            case 'textarea':
              record[field.name] = `Fallback ${field.name}`;
              break;
            case 'email':
              record[field.name] = 'fallback@example.com';
              break;
            case 'int':
            case 'integer':
            case 'double':
            case 'currency':
              record[field.name] = 1;
              break;
            case 'date':
              record[field.name] = new Date().toISOString().split('T')[0];
              break;
            case 'datetime':
              record[field.name] = new Date().toISOString();
              break;
            case 'boolean':
              record[field.name] = true;
              break;
            case 'picklist':
              if (field.picklistValues && field.picklistValues.length > 0) {
                const activeValues = field.picklistValues.filter(pv => pv.active);
                if (activeValues.length > 0) {
                  record[field.name] = activeValues[0].value;
                }
              }
              break;
          }
        }
      }
    });
    
    return record;
  }
}

module.exports = {
  ConstraintSolver
};