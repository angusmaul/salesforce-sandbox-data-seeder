/**
 * Salesforce Field Type Library
 * 
 * This library provides a comprehensive mapping of Salesforce field types
 * to appropriate data generation strategies. It's designed to be:
 * 1. Metadata-driven (uses field type, not just name)
 * 2. Context-aware (considers object and field name for better data)
 * 3. AI-ready (structured for future ML enhancements)
 */

const { faker } = require('@faker-js/faker');

/**
 * Salesforce-Validated Western Countries Data Dictionary
 * Contains EXACT country codes and state codes that Salesforce expects
 * Based on real Salesforce org picklist values with validFor mappings
 */
const WESTERN_COUNTRIES_DATA = {
  'AU': {
    name: 'Australia',
    states: ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'] // Default country in Salesforce
  },
  'US': {
    name: 'United States',
    states: ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']
  },
  'CA': {
    name: 'Canada',
    states: ['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']
  },
  'GB': {
    name: 'United Kingdom',
    states: [] // UK doesn't use states in Salesforce
  }
};

/**
 * Get array of available country codes for random selection
 */
const AVAILABLE_COUNTRY_CODES = Object.keys(WESTERN_COUNTRIES_DATA);

/**
 * Salesforce Field Types and their characteristics
 * Based on official Salesforce field type documentation
 */
const SALESFORCE_FIELD_TYPES = {
  // Text Types
  STRING: 'string',
  TEXTAREA: 'textarea',
  EMAIL: 'email',
  PHONE: 'phone',
  URL: 'url',
  ENCRYPTEDSTRING: 'encryptedstring',
  
  // Numeric Types
  INT: 'int',
  DOUBLE: 'double',
  CURRENCY: 'currency',
  PERCENT: 'percent',
  
  // Date/Time Types
  DATE: 'date',
  DATETIME: 'datetime',
  TIME: 'time',
  
  // Boolean Type
  BOOLEAN: 'boolean',
  
  // Selection Types
  PICKLIST: 'picklist',
  MULTIPICKLIST: 'multipicklist',
  COMBOBOX: 'combobox',
  
  // Relationship Types
  REFERENCE: 'reference',
  MASTERDETAIL: 'masterdetail',
  
  // Special Types
  ID: 'id',
  BASE64: 'base64',
  LOCATION: 'location',
  ADDRESS: 'address',
  ANYTYPE: 'anytype',
  CALCULATED: 'calculated',
  COMPLEXVALUE: 'complexvalue'
};

/**
 * Field validation rules and constraints by type
 */
const FIELD_TYPE_CONSTRAINTS = {
  [SALESFORCE_FIELD_TYPES.STRING]: {
    maxLength: 255,
    minLength: 0,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.TEXTAREA]: {
    maxLength: 131072, // 128KB
    minLength: 0,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.EMAIL]: {
    maxLength: 80,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.PHONE]: {
    maxLength: 40,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.URL]: {
    maxLength: 255,
    pattern: /^https?:\/\/.+/,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.INT]: {
    min: -2147483648,
    max: 2147483647,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.DOUBLE]: {
    precision: 18,
    scale: 0,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.CURRENCY]: {
    precision: 18,
    scale: 2,
    min: -999999999999999.99,
    max: 999999999999999.99,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.PERCENT]: {
    min: -100,
    max: 100,
    scale: 2,
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.DATE]: {
    min: '1700-01-01',
    max: '4000-12-31',
    format: 'YYYY-MM-DD',
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.DATETIME]: {
    min: '1700-01-01T00:00:00.000Z',
    max: '4000-12-31T23:59:59.999Z',
    format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    allowNull: true
  },
  [SALESFORCE_FIELD_TYPES.LOCATION]: {
    latitude: { min: -90, max: 90 },
    longitude: { min: -180, max: 180 },
    allowNull: true
  }
};

/**
 * Context-aware field patterns for smarter data generation
 * These patterns help identify field purpose beyond just type
 */
const FIELD_CONTEXT_PATTERNS = {
  // Geographic coordinates
  LATITUDE: /lat(itude)?/i,
  LONGITUDE: /lon(g|gitude)?/i,
  
  // Personal Information
  FIRST_NAME: /^(first|fname|given).*name/i,
  LAST_NAME: /^(last|lname|surname|family).*name/i,
  MIDDLE_NAME: /^(middle|mname).*name/i,
  FULL_NAME: /^(full|complete|whole).*name/i,
  
  // Contact Information
  EMAIL: /email|e-mail|emailaddress/i,
  PHONE: /phone|tel|mobile|cell|fax/i,
  FAX: /fax/i,
  MOBILE: /mobile|cell/i,
  
  // Address Components
  STREET: /street|address.*1|billing.*street|shipping.*street|mailing.*street/i,
  CITY: /city|town|municipality/i,
  STATE: /state|province|region/i,
  POSTAL_CODE: /postal|zip|postcode/i,
  COUNTRY: /country|nation/i,
  
  // Business Fields
  COMPANY: /company|organization|org|account.*name|business/i,
  REVENUE: /revenue|income|earnings/i,
  EMPLOYEE_COUNT: /employee|staff|headcount/i,
  INDUSTRY: /industry|sector|vertical/i,
  WEBSITE: /website|site|url|homepage/i,
  
  // Dates
  BIRTH_DATE: /birth|born|dob/i,
  START_DATE: /start|begin|commence|effective/i,
  END_DATE: /end|expire|terminate|close/i,
  
  // Identifiers
  ACCOUNT_NUMBER: /account.*number|acct.*num/i,
  SERIAL_NUMBER: /serial/i,
  SKU: /sku|stock.*keeping/i,
  PRODUCT_CODE: /product.*code/i,
  
  // Financial
  AMOUNT: /amount|price|cost|fee|total/i,
  QUANTITY: /quantity|qty|count|number/i,
  DISCOUNT: /discount|reduction/i,
  TAX: /tax|vat|gst/i,
  
  // Status/Boolean indicators
  ACTIVE: /active|enabled|valid/i,
  INACTIVE: /inactive|disabled|invalid/i,
  DELETED: /deleted|removed|archived/i,
  OPTED_OUT: /opt.*out|unsubscribe|donotcall/i
};

/**
 * Data generation strategies for each field type
 * Each strategy returns appropriate fake data based on field metadata
 */
class FieldDataGenerator {
  /**
   * Generate appropriate value based on field type and context
   * @param {Object} field - Salesforce field metadata
   * @param {number} index - Record index for variation
   * @param {string} objectName - Name of the Salesforce object
   * @param {Object} options - Additional options for generation (includes preferences)
   * @param {Object} recordContext - Current record data for relationship awareness
   * @returns {*} Generated field value
   */
  static generateValue(field, index = 0, objectName = '', options = {}, recordContext = {}) {
    const fieldType = field.type?.toLowerCase();
    const fieldName = field.name;
    const fieldLabel = field.label;
    
    // First check if field is read-only, calculated, or a formula field
    // Formula fields have calculated: true or calculatedFormula property
    if (field.calculated || 
        field.calculatedFormula || 
        field.autoNumber || 
        field.createable === false ||
        fieldType === 'calculated' ||
        fieldType === 'summary') {
      return null;
    }
    
    // Generate based on field type
    let value = null;
    switch (fieldType) {
      case SALESFORCE_FIELD_TYPES.LOCATION:
        value = this.generateLocation(field, fieldName);
        break;
        
      case SALESFORCE_FIELD_TYPES.STRING:
      case SALESFORCE_FIELD_TYPES.TEXTAREA:
        value = this.generateText(field, fieldName, fieldLabel, objectName, index, options, recordContext);
        break;
        
      case SALESFORCE_FIELD_TYPES.EMAIL:
        value = this.generateEmail(field, index);
        break;
        
      case SALESFORCE_FIELD_TYPES.PHONE:
        value = this.generatePhone(field, fieldName);
        break;
        
      case SALESFORCE_FIELD_TYPES.URL:
        value = this.generateUrl(field);
        break;
        
      case SALESFORCE_FIELD_TYPES.INT:
        value = this.generateInteger(field, fieldName, index);
        break;
        
      case SALESFORCE_FIELD_TYPES.DOUBLE:
        value = this.generateDouble(field, fieldName, index);
        break;
        
      case SALESFORCE_FIELD_TYPES.CURRENCY:
        value = this.generateCurrency(field, fieldName);
        break;
        
      case SALESFORCE_FIELD_TYPES.PERCENT:
        value = this.generatePercent(field, index);
        break;
        
      case SALESFORCE_FIELD_TYPES.DATE:
        value = this.generateDate(field, fieldName);
        break;
        
      case SALESFORCE_FIELD_TYPES.DATETIME:
        value = this.generateDateTime(field, fieldName);
        break;
        
      case SALESFORCE_FIELD_TYPES.BOOLEAN:
        value = this.generateBoolean(field, fieldName);
        break;
        
      case SALESFORCE_FIELD_TYPES.PICKLIST:
        value = this.generatePicklist(field, index, objectName, options, recordContext);
        break;
        
      case SALESFORCE_FIELD_TYPES.MULTIPICKLIST:
        value = this.generateMultiPicklist(field, index);
        break;
        
      case SALESFORCE_FIELD_TYPES.REFERENCE:
        // References should be handled by relationship logic
        value = options.referenceId || null;
        break;
        
      default:
        value = null;
    }
    
    // CRITICAL: Metadata-driven required field validation
    // If field is required and we got null/empty, apply fallback
    if (field.required && (value === null || value === undefined || value === '')) {
      console.log(`⚠️ Required field ${objectName}.${fieldName} generated null/empty value, applying fallback`);
      value = this.generateRequiredFieldFallback(field, objectName, index);
      console.log(`✅ Required field fallback applied: ${objectName}.${fieldName} = ${value}`);
    }
    
    return value;
  }
  
  /**
   * Generate fallback values for required fields that generated null/empty
   * Ensures all required fields always have values to prevent Salesforce validation errors
   * @param {Object} field - Salesforce field metadata
   * @param {string} objectName - Name of the Salesforce object
   * @param {number} index - Record index for variation
   * @returns {*} Guaranteed non-null value for required field
   */
  static generateRequiredFieldFallback(field, objectName, index) {
    const timestamp = Date.now().toString().slice(-8);
    const recordIndex = (index + 1).toString().padStart(3, '0');
    const fieldType = field.type?.toLowerCase();
    const fieldName = field.name;
    
    switch (fieldType) {
      case SALESFORCE_FIELD_TYPES.STRING:
      case SALESFORCE_FIELD_TYPES.TEXTAREA:
        // Handle Name fields specifically
        if (fieldName.toLowerCase() === 'name') {
          if (objectName === 'Account') {
            return `${faker.company.name()} ${timestamp}${recordIndex}`;
          } else if (objectName === 'Contact' || objectName === 'Lead') {
            return faker.person.fullName();
          } else if (objectName === 'Opportunity') {
            const oppTypes = ['Partnership', 'Expansion', 'Upgrade', 'Implementation'];
            const oppType = oppTypes[index % oppTypes.length];
            return `${faker.company.name()} - ${oppType} ${timestamp}`;
          } else {
            return `${objectName} ${timestamp}${recordIndex}`;
          }
        }
        // Other required text fields
        return `Required ${fieldName} ${timestamp}${recordIndex}`;
      
      case SALESFORCE_FIELD_TYPES.EMAIL:
        return `required${timestamp}${recordIndex}@example.com`;
      
      case SALESFORCE_FIELD_TYPES.PHONE:
        return '+61 2 0000 0000';
      
      case SALESFORCE_FIELD_TYPES.URL:
        return `https://example.com/required-${timestamp}`;
      
      case SALESFORCE_FIELD_TYPES.PICKLIST:
        // Use first available active picklist value
        if (field.picklistValues && field.picklistValues.length > 0) {
          const activeValues = field.picklistValues.filter(pv => pv.active);
          if (activeValues.length > 0) {
            return activeValues[0].value;
          }
        }
        return 'Unknown';
      
      case SALESFORCE_FIELD_TYPES.MULTIPICKLIST:
        // Use first available active picklist value
        if (field.picklistValues && field.picklistValues.length > 0) {
          const activeValues = field.picklistValues.filter(pv => pv.active);
          if (activeValues.length > 0) {
            return activeValues[0].value;
          }
        }
        return 'Unknown';
      
      case SALESFORCE_FIELD_TYPES.INT:
        return 1;
      
      case SALESFORCE_FIELD_TYPES.DOUBLE:
      case SALESFORCE_FIELD_TYPES.CURRENCY:
        return 1.0;
      
      case SALESFORCE_FIELD_TYPES.PERCENT:
        return 0.0;
      
      case SALESFORCE_FIELD_TYPES.DATE:
        return new Date().toISOString().split('T')[0];
      
      case SALESFORCE_FIELD_TYPES.DATETIME:
        return new Date().toISOString();
      
      case SALESFORCE_FIELD_TYPES.BOOLEAN:
        return false;
      
      default:
        // Generic fallback for unknown field types
        return `Required_${timestamp}${recordIndex}`;
    }
  }
  
  /**
   * Generate location (latitude/longitude) values
   */
  static generateLocation(field, fieldName) {
    // Check if this is a latitude or longitude field
    if (FIELD_CONTEXT_PATTERNS.LATITUDE.test(fieldName)) {
      return faker.location.latitude();
    } else if (FIELD_CONTEXT_PATTERNS.LONGITUDE.test(fieldName)) {
      return faker.location.longitude();
    }
    
    // For compound location fields, return an object
    return {
      latitude: faker.location.latitude(),
      longitude: faker.location.longitude()
    };
  }
  
  /**
   * Generate text values based on context with smart address generation
   */
  static generateText(field, fieldName, fieldLabel, objectName, index, options = {}, recordContext = {}) {
    const maxLength = field.length || 255;
    let value;
    
    // (Debug logging removed for production)
    
    // Check field context patterns
    if (FIELD_CONTEXT_PATTERNS.FIRST_NAME.test(fieldName)) {
      value = faker.person.firstName();
    } else if (FIELD_CONTEXT_PATTERNS.LAST_NAME.test(fieldName)) {
      value = faker.person.lastName();
    } else if (FIELD_CONTEXT_PATTERNS.MIDDLE_NAME.test(fieldName)) {
      value = faker.person.middleName();
    } else if (FIELD_CONTEXT_PATTERNS.FULL_NAME.test(fieldName)) {
      value = faker.person.fullName();
    } else if (FIELD_CONTEXT_PATTERNS.COMPANY.test(fieldName)) {
      value = faker.company.name();
    } else if (FIELD_CONTEXT_PATTERNS.STREET.test(fieldName)) {
      value = faker.location.streetAddress();
    } else if (FIELD_CONTEXT_PATTERNS.CITY.test(fieldName)) {
      value = faker.location.city();
    } else if (this.isStateField(fieldName)) {
      console.log(`🎯 STATE pattern matched for: ${fieldName}`);
      // Use org-specific state generation if preferences available, otherwise use simple Western countries
      const preferences = options.preferences;
      if (preferences && preferences.useOrgPicklists) {
        value = this.generateOrgSpecificState(field, fieldName, objectName, index, recordContext, preferences);
      } else {
        value = this.generateSimpleState(field, fieldName, objectName, index, recordContext);
      }
    } else if (FIELD_CONTEXT_PATTERNS.POSTAL_CODE.test(fieldName)) {
      value = faker.location.zipCode();
    } else if (FIELD_CONTEXT_PATTERNS.COUNTRY.test(fieldName)) {
      console.log(`🎯 COUNTRY pattern matched for: ${fieldName}`);
      // Use org-specific country generation if preferences available, otherwise use simple Western countries
      const preferences = options.preferences;
      if (preferences && preferences.useOrgPicklists) {
        value = this.generateOrgSpecificCountry(field, fieldName, objectName, index, recordContext, preferences);
      } else {
        value = this.generateSimpleCountry(field, fieldName, objectName, index, recordContext);
      }
    } else if (FIELD_CONTEXT_PATTERNS.INDUSTRY.test(fieldName)) {
      const industries = ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Energy'];
      value = industries[index % industries.length];
    } else if (FIELD_CONTEXT_PATTERNS.ACCOUNT_NUMBER.test(fieldName)) {
      value = `ACC-${Date.now()}-${index}`;
    } else if (FIELD_CONTEXT_PATTERNS.SERIAL_NUMBER.test(fieldName)) {
      value = `SN${faker.string.alphanumeric(10).toUpperCase()}`;
    } else if (FIELD_CONTEXT_PATTERNS.SKU.test(fieldName)) {
      value = `SKU-${faker.string.alphanumeric(8).toUpperCase()}`;
    } else if (FIELD_CONTEXT_PATTERNS.PRODUCT_CODE.test(fieldName)) {
      value = `PROD-${faker.string.alphanumeric(6).toUpperCase()}`;
    } else if (fieldName.toLowerCase().includes('abn')) {
      // Australian Business Number - 11 digits only, no characters or spaces
      value = faker.string.numeric(11);
    } else if (fieldName.toLowerCase().includes('acn')) {
      // Australian Company Number - 9 digits only  
      value = faker.string.numeric(9);
    } else if (fieldName.toLowerCase().includes('sap') && fieldName.toLowerCase().includes('reference')) {
      // SAP Reference - 7 digits exactly
      value = faker.string.numeric(7);
    } else if (fieldName.toLowerCase() === 'name') {
      // Handle Name field specifically by object type - ALWAYS return a value
      if (objectName === 'Account') {
        // Generate unique business names with guaranteed uniqueness
        const timestamp = Date.now().toString().slice(-8);
        const recordIndex = (index + 1).toString().padStart(3, '0');
        value = `${faker.company.name()} ${timestamp}${recordIndex}`;
      } else if (objectName === 'Contact' || objectName === 'Lead') {
        // Generate person names
        value = faker.person.fullName();
      } else if (objectName === 'Opportunity') {
        // Generate opportunity names
        const oppTypes = ['Partnership', 'Expansion', 'Upgrade', 'Implementation', 'Consulting', 'License', 'Service'];
        const companyName = faker.company.name();
        const oppType = oppTypes[index % oppTypes.length];
        const timestamp = Date.now().toString().slice(-4);
        value = `${companyName} - ${oppType} ${timestamp}`;
      } else {
        // Default name generation with guaranteed uniqueness
        const timestamp = Date.now().toString().slice(-6);
        value = `${objectName} ${faker.lorem.word()} ${timestamp}${index + 1}`;
      }
      
      // CRITICAL: Ensure Name field is NEVER null or empty
      if (!value || value.trim() === '') {
        const fallbackTimestamp = Date.now().toString().slice(-8);
        value = `${objectName || 'Record'} ${fallbackTimestamp}${index + 1}`;
        console.log(`⚠️ Fallback name generated for ${objectName}.${fieldName}: ${value}`);
      }
      
      console.log(`✅ Name field generated for ${objectName}.${fieldName}: ${value}`);
    } else if (fieldName.toLowerCase().includes('description')) {
      value = faker.lorem.paragraph();
    } else if (fieldName.toLowerCase().includes('title')) {
      value = faker.person.jobTitle();
    } else if (fieldName.toLowerCase().includes('department')) {
      const departments = ['Sales', 'Marketing', 'Engineering', 'HR', 'Finance', 'Operations', 'Support'];
      value = departments[index % departments.length];
    } else {
      // Default text generation
      value = faker.lorem.words(3);
    }
    
    // Ensure value fits within field length
    if (value && value.length > maxLength) {
      value = value.substring(0, maxLength);
    }
    
    return value;
  }
  
  /**
   * Generate country values using org-specific country data or Western Countries dictionary
   * @param {Object} field - Salesforce field metadata
   * @param {string} fieldName - Field name
   * @param {string} objectName - Salesforce object name
   * @param {number} index - Record index
   * @param {Object} recordContext - Record context for state/country coordination
   * @param {Object} preferences - User's data generation preferences (optional)
   * @returns {string} Country code or name
   */
  static generateOrgSpecificCountry(field, fieldName, objectName, index, recordContext, preferences = null) {
    // Use org-specific selected countries if preferences provided, otherwise fallback to Western countries
    const availableCountries = preferences?.selectedCountries || AVAILABLE_COUNTRY_CODES;
    
    if (availableCountries.length === 0) {
      console.log(`⚠️ No countries selected, defaulting to AU`);
      availableCountries = ['AU'];
    }
    
    // Use consistent country selection based on record index to ensure stability
    const selectedCountryCode = availableCountries[index % availableCountries.length];
    
    // Get country data from org-specific mapping or fallback to Western countries
    const orgMapping = preferences?.customStateMapping || WESTERN_COUNTRIES_DATA;
    const countryData = orgMapping[selectedCountryCode] || WESTERN_COUNTRIES_DATA[selectedCountryCode];
    
    if (!countryData && selectedCountryCode !== 'AU') {
      console.log(`⚠️ Country data not found for ${selectedCountryCode}, defaulting to AU`);
      const fallbackCountryCode = 'AU';
      
      // Store fallback country in record context
      if (!recordContext.selectedCountries) {
        recordContext.selectedCountries = {};
      }
      const addressPrefix = this.extractAddressPrefix(fieldName);
      recordContext.selectedCountries[addressPrefix] = fallbackCountryCode;
      
      const isCountryCodeField = fieldName.toLowerCase().includes('countrycode');
      return isCountryCodeField ? fallbackCountryCode : 'Australia';
    }
    
    // Determine if this is a CountryCode field (uses codes) or Country field (uses names)
    const isCountryCodeField = fieldName.toLowerCase().includes('countrycode');
    
    console.log(`🌍 Selected ${preferences ? 'org-specific' : 'Western'} country for ${objectName}.${fieldName}: ${selectedCountryCode}${countryData ? ` (${countryData.name || selectedCountryCode})` : ''}`);
    
    // Store selected country CODE in record context for state field generation
    if (!recordContext.selectedCountries) {
      recordContext.selectedCountries = {};
    }
    const addressPrefix = this.extractAddressPrefix(fieldName);
    recordContext.selectedCountries[addressPrefix] = selectedCountryCode;
    
    // Return appropriate format based on field type
    if (isCountryCodeField) {
      console.log(`🔹 Returning country CODE for ${fieldName}: ${selectedCountryCode}`);
      return selectedCountryCode;
    } else {
      const countryName = countryData?.name || this.getCountryName(selectedCountryCode);
      console.log(`🔹 Returning country NAME for ${fieldName}: ${countryName}`);
      return countryName;
    }
  }
  
  /**
   * Generate country values using Western Countries dictionary (backward compatibility)
   */
  static generateSimpleCountry(field, fieldName, objectName, index, recordContext) {
    // Use consistent country selection based on record index to ensure stability
    const selectedCountryCode = AVAILABLE_COUNTRY_CODES[index % AVAILABLE_COUNTRY_CODES.length];
    const countryData = WESTERN_COUNTRIES_DATA[selectedCountryCode];
    
    if (!countryData) {
      console.log(`⚠️ Country data not found for ${selectedCountryCode}, defaulting to AU`);
      const fallbackCountryCode = 'AU';
      const fallbackCountryData = WESTERN_COUNTRIES_DATA[fallbackCountryCode];
      
      // Store fallback country in record context
      if (!recordContext.selectedCountries) {
        recordContext.selectedCountries = {};
      }
      const addressPrefix = this.extractAddressPrefix(fieldName);
      recordContext.selectedCountries[addressPrefix] = fallbackCountryCode;
      
      const isCountryCodeField = fieldName.toLowerCase().includes('countrycode');
      return isCountryCodeField ? fallbackCountryCode : fallbackCountryData.name;
    }
    
    // Determine if this is a CountryCode field (uses codes) or Country field (uses names)
    const isCountryCodeField = fieldName.toLowerCase().includes('countrycode');
    
    console.log(`🌍 Selected Western country for ${objectName}.${fieldName}: ${selectedCountryCode} (${countryData.name})`);
    
    // Store selected country CODE in record context for state field generation
    if (!recordContext.selectedCountries) {
      recordContext.selectedCountries = {};
    }
    const addressPrefix = this.extractAddressPrefix(fieldName);
    recordContext.selectedCountries[addressPrefix] = selectedCountryCode;
    
    // Return appropriate format based on field type
    if (isCountryCodeField) {
      console.log(`🔹 Returning country CODE for ${fieldName}: ${selectedCountryCode}`);
      return selectedCountryCode;
    } else {
      console.log(`🔹 Returning country NAME for ${fieldName}: ${countryData.name}`);
      return countryData.name;
    }
  }
  
  /**
   * Get country name from country code
   */
  static getCountryName(countryCode) {
    const countryNames = {
      'AU': 'Australia',
      'US': 'United States',
      'CA': 'Canada', 
      'GB': 'United Kingdom',
      'NZ': 'New Zealand',
      'IE': 'Ireland',
      'FR': 'France',
      'DE': 'Germany',
      'ES': 'Spain',
      'IT': 'Italy',
      'NL': 'Netherlands'
    };
    
    return countryNames[countryCode] || countryCode;
  }
  
  /**
   * Generate state values using org-specific state mapping or Western Countries dictionary
   * @param {Object} field - Salesforce field metadata
   * @param {string} fieldName - Field name
   * @param {string} objectName - Salesforce object name
   * @param {number} index - Record index
   * @param {Object} recordContext - Record context for state/country coordination
   * @param {Object} preferences - User's data generation preferences (optional)
   * @returns {string|null} State code or null if no states for country
   */
  static generateOrgSpecificState(field, fieldName, objectName, index, recordContext, preferences = null) {
    console.log(`🏛️ Org-specific state field analysis: ${fieldName} for ${objectName}`);
    
    // Get the corresponding country for this address prefix
    const addressPrefix = this.extractAddressPrefix(fieldName);
    const selectedCountryCode = recordContext.selectedCountries?.[addressPrefix];
    
    if (!selectedCountryCode) {
      console.log(`⚠️ No country selected yet for ${addressPrefix} address, skipping state`);
      return null;
    }
    
    // Get org-specific state mapping or fallback to Western countries
    const orgMapping = preferences?.customStateMapping || {};
    let availableStates = orgMapping[selectedCountryCode];
    
    // If no org-specific mapping, use Western countries data
    if (!availableStates) {
      const countryData = WESTERN_COUNTRIES_DATA[selectedCountryCode];
      availableStates = countryData?.states;
    }
    
    // Check if this country has states
    if (!availableStates || availableStates.length === 0) {
      console.log(`🏛️ Country ${selectedCountryCode} has no states in ${preferences ? 'org-specific' : 'Western countries'} mapping, returning null`);
      return null;
    }
    
    // Select a state from the available states for this country
    const selectedState = availableStates[index % availableStates.length];
    console.log(`🏛️ Selected ${preferences ? 'org-specific' : 'Western countries'} state for ${objectName}.${fieldName}: ${selectedState} (country: ${selectedCountryCode})`);
    return selectedState;
  }
  
  /**
   * Generate state values using Western Countries dictionary (backward compatibility)
   */
  static generateSimpleState(field, fieldName, objectName, index, recordContext) {
    console.log(`🏛️ State field analysis: ${fieldName} for ${objectName}`);
    
    // Get the corresponding country for this address prefix
    const addressPrefix = this.extractAddressPrefix(fieldName);
    const selectedCountryCode = recordContext.selectedCountries?.[addressPrefix];
    
    if (!selectedCountryCode) {
      console.log(`⚠️ No country selected yet for ${addressPrefix} address, skipping state`);
      return null;
    }
    
    // Get country data from dictionary
    const countryData = WESTERN_COUNTRIES_DATA[selectedCountryCode];
    if (!countryData) {
      console.log(`⚠️ Unknown country code: ${selectedCountryCode}, skipping state`);
      return null;
    }
    
    // Check if this country has states
    if (!countryData.states || countryData.states.length === 0) {
      console.log(`🏛️ Country ${selectedCountryCode} (${countryData.name}) has no states, returning null`);
      return null;
    }
    
    // Select a state from the available states for this country
    const selectedState = countryData.states[index % countryData.states.length];
    console.log(`🏛️ Selected state for ${objectName}.${fieldName}: ${selectedState} (country: ${selectedCountryCode})`);
    return selectedState;
  }
  
  /**
   * Check if a field is a valid state field (not custom Region fields)
   */
  static isStateField(fieldName) {
    // Standard Salesforce state fields
    if (fieldName.toLowerCase().includes('statecode')) return true;
    
    // Standard address state patterns
    if (FIELD_CONTEXT_PATTERNS.STATE.test(fieldName)) {
      // Exclude custom Region fields that aren't actual state fields
      if (fieldName.toLowerCase().includes('region') && fieldName.includes('__c')) {
        return false; // Custom region fields are not state fields
      }
      return true;
    }
    
    return false;
  }
  
  /**
   * Extract address prefix from field name (Billing, Shipping, etc.)
   */
  static extractAddressPrefix(fieldName) {
    if (fieldName.startsWith('Billing')) return 'Billing';
    if (fieldName.startsWith('Shipping')) return 'Shipping';
    if (fieldName.startsWith('Mailing')) return 'Shipping';
    if (fieldName.startsWith('Other')) return 'Other';
    return 'Base'; // For fields like StateCode without prefix
  }
  
  /**
   * Find the appropriate mapping key for this field
   */
  static findMappingKey(objectName, fieldName, stateCountryMappings) {
    const addressPrefix = this.extractAddressPrefix(fieldName);
    const key = `${objectName}.${addressPrefix}`;
    return stateCountryMappings[key] ? key : null;
  }
  
  /**
   * Convert country code to country name using conservative mapping
   * Only includes widely-recognized, non-controversial countries to avoid content filtering
   */
  static convertCountryCodeToName(countryCode) {
    // Conservative code-to-name conversion for major countries only
    const codeToNameMap = {
      'US': 'United States',
      'CA': 'Canada', 
      'GB': 'United Kingdom',
      'AU': 'Australia',
      'DE': 'Germany',
      'FR': 'France',
      'JP': 'Japan',
      'IN': 'India',
      'BR': 'Brazil',
      'NZ': 'New Zealand',
      'MX': 'Mexico',
      'ES': 'Spain',
      'IT': 'Italy',
      'NL': 'Netherlands',
      'BE': 'Belgium',
      'CH': 'Switzerland',
      'AT': 'Austria',
      'SE': 'Sweden',
      'NO': 'Norway',
      'DK': 'Denmark',
      'FI': 'Finland',
      'PL': 'Poland',
      'PT': 'Portugal',
      'IE': 'Ireland',
      'GR': 'Greece',
      'CZ': 'Czech Republic',
      'HU': 'Hungary',
      'RO': 'Romania',
      'BG': 'Bulgaria',
      'HR': 'Croatia',
      'SK': 'Slovakia',
      'SI': 'Slovenia',
      'LU': 'Luxembourg',
      'MT': 'Malta',
      'CY': 'Cyprus',
      'EE': 'Estonia',
      'LV': 'Latvia',
      'LT': 'Lithuania'
    };
    
    // For unmapped countries, return the code itself to avoid content filtering issues
    // This ensures valid Salesforce picklist values while avoiding controversial mappings
    return codeToNameMap[countryCode] || countryCode;
  }
  
  /**
   * Fallback country generation when smart mapping is unavailable
   */
  static generateFallbackCountry(fieldName, maxLength, index) {
    if (fieldName.toLowerCase().includes('countrycode') || maxLength <= 3) {
      // Use common country codes for fallback
      const fallbackCountryCodes = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'JP', 'IN'];
      return fallbackCountryCodes[index % fallbackCountryCodes.length];
    } else {
      return faker.location.country();
    }
  }
  
  /**
   * Fallback state generation when smart mapping is unavailable
   */
  static generateFallbackState(fieldName, maxLength, index) {
    if (fieldName.toLowerCase().includes('statecode') || maxLength <= 3) {
      // Use common US state codes for fallback
      const fallbackStateCodes = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA'];
      return fallbackStateCodes[index % fallbackStateCodes.length];
    } else {
      return faker.location.state({ abbreviated: maxLength <= 2 });
    }
  }
  
  /**
   * Generate email addresses
   */
  static generateEmail(field, index) {
    return faker.internet.email();
  }
  
  /**
   * Generate phone numbers
   */
  static generatePhone(field, fieldName) {
    // Generate valid phone numbers with proper formatting
    // Common formats that pass most validation rules
    if (FIELD_CONTEXT_PATTERNS.FAX.test(fieldName)) {
      return `+61 2 ${faker.string.numeric(4)} ${faker.string.numeric(4)}`; // Australian format
    } else if (FIELD_CONTEXT_PATTERNS.MOBILE.test(fieldName)) {
      return `+61 4${faker.string.numeric(2)} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`; // Australian mobile
    }
    // Default phone format
    return `+61 ${faker.helpers.arrayElement(['2', '3', '7', '8'])} ${faker.string.numeric(4)} ${faker.string.numeric(4)}`;
  }
  
  /**
   * Generate URLs
   */
  static generateUrl(field) {
    return faker.internet.url();
  }
  
  /**
   * Generate integer values based on context
   */
  static generateInteger(field, fieldName, index) {
    // Check for specific patterns
    if (FIELD_CONTEXT_PATTERNS.EMPLOYEE_COUNT.test(fieldName)) {
      return faker.number.int({ min: 1, max: 10000 });
    } else if (FIELD_CONTEXT_PATTERNS.QUANTITY.test(fieldName)) {
      return faker.number.int({ min: 1, max: 1000 });
    } else if (fieldName.toLowerCase().includes('year')) {
      return faker.number.int({ min: 2000, max: 2025 });
    } else if (fieldName.toLowerCase().includes('age')) {
      return faker.number.int({ min: 18, max: 85 });
    } else if (fieldName.toLowerCase().includes('count') || fieldName.toLowerCase().includes('number')) {
      return faker.number.int({ min: 0, max: 100 });
    }
    
    // Default integer generation
    return faker.number.int({ min: 1, max: 1000 });
  }
  
  /**
   * Generate double/float values based on context
   * IMPORTANT: Check for coordinate fields first!
   */
  static generateDouble(field, fieldName, index) {
    // CRITICAL: Check if this is a coordinate field by name pattern
    // This handles custom fields like Latitude__c, Longitude__c, PersonMailingLatitude, etc.
    if (FIELD_CONTEXT_PATTERNS.LATITUDE.test(fieldName)) {
      return parseFloat(faker.location.latitude());
    } else if (FIELD_CONTEXT_PATTERNS.LONGITUDE.test(fieldName)) {
      return parseFloat(faker.location.longitude());
    }
    
    // Check for other patterns
    if (FIELD_CONTEXT_PATTERNS.REVENUE.test(fieldName)) {
      return faker.number.float({ min: 10000, max: 10000000, multipleOf: 0.01 });
    } else if (FIELD_CONTEXT_PATTERNS.AMOUNT.test(fieldName)) {
      return faker.number.float({ min: 100, max: 100000, multipleOf: 0.01 });
    } else if (fieldName.toLowerCase().includes('rate')) {
      return faker.number.float({ min: 0, max: 100, multipleOf: 0.01 });
    } else if (fieldName.toLowerCase().includes('score')) {
      return faker.number.float({ min: 0, max: 100, multipleOf: 0.1 });
    }
    
    // Default double generation with reasonable range
    return faker.number.float({ min: 0, max: 10000, multipleOf: 0.01 });
  }
  
  /**
   * Generate currency values
   */
  static generateCurrency(field, fieldName) {
    if (FIELD_CONTEXT_PATTERNS.REVENUE.test(fieldName)) {
      return faker.number.float({ min: 100000, max: 10000000, multipleOf: 0.01 });
    } else if (FIELD_CONTEXT_PATTERNS.AMOUNT.test(fieldName)) {
      return faker.number.float({ min: 10, max: 100000, multipleOf: 0.01 });
    } else if (FIELD_CONTEXT_PATTERNS.DISCOUNT.test(fieldName)) {
      return faker.number.float({ min: 0, max: 1000, multipleOf: 0.01 });
    } else if (FIELD_CONTEXT_PATTERNS.TAX.test(fieldName)) {
      return faker.number.float({ min: 0, max: 10000, multipleOf: 0.01 });
    }
    
    return faker.number.float({ min: 100, max: 100000, multipleOf: 0.01 });
  }
  
  /**
   * Generate percentage values
   */
  static generatePercent(field, index) {
    return faker.number.float({ min: 0, max: 100, multipleOf: 0.01 });
  }
  
  /**
   * Generate date values based on context
   */
  static generateDate(field, fieldName) {
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const oneYearFromNow = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    
    if (FIELD_CONTEXT_PATTERNS.BIRTH_DATE.test(fieldName)) {
      // Generate birth dates between 18 and 65 years ago
      const maxAge = new Date(today.getFullYear() - 65, today.getMonth(), today.getDate());
      const minAge = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
      return faker.date.between({ from: maxAge, to: minAge }).toISOString().split('T')[0];
    } else if (FIELD_CONTEXT_PATTERNS.START_DATE.test(fieldName)) {
      // Start dates in the past year
      return faker.date.between({ from: oneYearAgo, to: today }).toISOString().split('T')[0];
    } else if (FIELD_CONTEXT_PATTERNS.END_DATE.test(fieldName)) {
      // End dates in the future
      return faker.date.between({ from: today, to: oneYearFromNow }).toISOString().split('T')[0];
    }
    
    // Default: dates within the past year
    return faker.date.recent({ days: 365 }).toISOString().split('T')[0];
  }
  
  /**
   * Generate datetime values
   */
  static generateDateTime(field, fieldName) {
    const dateStr = this.generateDate(field, fieldName);
    const time = faker.date.recent().toISOString().split('T')[1];
    return `${dateStr}T${time}`;
  }
  
  /**
   * Generate boolean values based on context
   */
  static generateBoolean(field, fieldName) {
    // Check patterns for smart defaults
    if (FIELD_CONTEXT_PATTERNS.ACTIVE.test(fieldName)) {
      return true;
    } else if (FIELD_CONTEXT_PATTERNS.INACTIVE.test(fieldName)) {
      return false;
    } else if (FIELD_CONTEXT_PATTERNS.DELETED.test(fieldName)) {
      return false;
    } else if (FIELD_CONTEXT_PATTERNS.OPTED_OUT.test(fieldName)) {
      return false;
    }
    
    // Default: 70% true, 30% false for most boolean fields
    return Math.random() > 0.3;
  }
  
  /**
   * Generate picklist values
   */
  static generatePicklist(field, index, objectName = '', options = {}, recordContext = {}) {
    const fieldName = field.name;
    
    // Handle State/Country picklist fields with org-specific or Western Countries dictionary
    if (FIELD_CONTEXT_PATTERNS.COUNTRY.test(fieldName) || fieldName.toLowerCase().includes('countrycode')) {
      console.log(`🌍 PICKLIST Country field detected: ${fieldName} for ${objectName}`);
      // Use org-specific or simple Western countries generation for country picklist fields
      const preferences = options.preferences;
      if (preferences && preferences.useOrgPicklists) {
        return this.generateOrgSpecificCountry(field, fieldName, objectName, index, recordContext, preferences);
      } else {
        return this.generateSimpleCountry(field, fieldName, objectName, index, recordContext);
      }
    } else if (this.isStateField(fieldName)) {
      console.log(`🏛️ PICKLIST State field detected: ${fieldName} for ${objectName}`);
      // Use org-specific or simple Western countries state generation for state picklist fields
      const preferences = options.preferences;
      if (preferences && preferences.useOrgPicklists) {
        return this.generateOrgSpecificState(field, fieldName, objectName, index, recordContext, preferences);
      } else {
        return this.generateSimpleState(field, fieldName, objectName, index, recordContext);
      }
    }
    
    // Standard picklist generation for non-address fields
    if (field.picklistValues && field.picklistValues.length > 0) {
      const activeValues = field.picklistValues.filter(pv => pv.active);
      if (activeValues.length > 0) {
        return activeValues[index % activeValues.length].value;
      }
    }
    return null;
  }
  
  /**
   * Generate multi-picklist values
   */
  static generateMultiPicklist(field, index) {
    if (field.picklistValues && field.picklistValues.length > 0) {
      const activeValues = field.picklistValues.filter(pv => pv.active);
      if (activeValues.length > 0) {
        const numSelections = Math.min(3, Math.floor(Math.random() * activeValues.length) + 1);
        const selected = activeValues.slice(0, numSelections).map(pv => pv.value);
        return selected.join(';');
      }
    }
    return null;
  }
}


/**
 * AI Enhancement Hooks
 * These functions can be replaced with AI models in the future
 */
class AIEnhancementHooks {
  /**
   * Analyze field context using AI (future implementation)
   * @param {Object} field - Field metadata
   * @param {string} objectName - Object context
   * @returns {Object} AI-suggested data generation strategy
   */
  static async analyzeFieldContext(field, objectName) {
    // Future: Call AI model to analyze field and suggest best data
    // For now, return null to use default logic
    return null;
  }
  
  /**
   * Generate contextually appropriate value using AI
   * @param {Object} field - Field metadata
   * @param {Object} recordContext - Other fields in the same record
   * @returns {*} AI-generated field value
   */
  static async generateContextualValue(field, recordContext) {
    // Future: Use AI to generate value based on other field values
    // Example: Generate appropriate job title based on department
    return null;
  }
  
  /**
   * Validate generated value using AI
   * @param {*} value - Generated value
   * @param {Object} field - Field metadata
   * @returns {boolean} Whether the value is appropriate
   */
  static async validateValue(value, field) {
    // Future: Use AI to validate if generated value makes sense
    return true;
  }
}

module.exports = {
  SALESFORCE_FIELD_TYPES,
  FIELD_TYPE_CONSTRAINTS,
  FIELD_CONTEXT_PATTERNS,
  FieldDataGenerator,
  AIEnhancementHooks
};