/**
 * Salesforce Picklist Decoder Service
 * 
 * This service handles decoding of Salesforce validFor bitmaps to understand
 * controlling field dependencies (e.g., Country -> State relationships).
 * 
 * The validFor bitmap encodes which controlling field values allow each
 * dependent field value. Reading bits left-to-right indicates validity.
 */

/**
 * Decode validFor bitmap to create controlling field mappings
 * @param {Object} dependentField - Field metadata with picklistValues containing validFor
 * @param {Object} controllingField - Controlling field metadata with picklistValues
 * @returns {Object} Mapping of controlling values to valid dependent values
 */
function decodeValidForMapping(dependentField, controllingField) {
  if (!dependentField.picklistValues || !controllingField.picklistValues) {
    console.warn(`⚠️ Missing picklist values for dependency decoding: ${dependentField.name} -> ${controllingField.name}`);
    return null;
  }

  const controllingValues = controllingField.picklistValues.filter(pv => pv.active);
  const dependentValues = dependentField.picklistValues.filter(pv => pv.active);
  
  const mapping = {};
  
  // Initialize mapping with empty arrays for each controlling value
  controllingValues.forEach(controllingValue => {
    mapping[controllingValue.value] = [];
  });
  
  // Decode validFor bitmap for each dependent value
  dependentValues.forEach(dependentValue => {
    if (!dependentValue.validFor) {
      // If no validFor, this dependent value is valid for all controlling values
      controllingValues.forEach(controllingValue => {
        mapping[controllingValue.value].push(dependentValue.value);
      });
      return;
    }
    
    // Decode base64 validFor to binary
    const validForBinary = base64ToBinary(dependentValue.validFor);
    
    // Check each bit position against controlling values
    controllingValues.forEach((controllingValue, index) => {
      if (index < validForBinary.length && validForBinary[index] === '1') {
        mapping[controllingValue.value].push(dependentValue.value);
      }
    });
  });
  
  return mapping;
}

/**
 * Convert base64 validFor string to binary representation
 * @param {string} base64String - Base64 encoded validFor bitmap
 * @returns {string} Binary string representation
 */
function base64ToBinary(base64String) {
  try {
    // Decode base64 to binary
    const binaryString = Buffer.from(base64String, 'base64')
      .toString('binary')
      .split('')
      .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
      .join('');
    
    return binaryString;
  } catch (error) {
    console.warn(`⚠️ Failed to decode validFor bitmap: ${base64String}`, error);
    return '';
  }
}

/**
 * Create a comprehensive state-country mapping from Salesforce field metadata
 * @param {Object} stateField - State field metadata (e.g., BillingStateCode)
 * @param {Object} countryField - Country field metadata (e.g., BillingCountryCode) 
 * @returns {Object} Country-to-states mapping and metadata
 */
function createStateCountryMapping(stateField, countryField) {
  console.log(`🌍 Creating state-country mapping for ${stateField.name} -> ${countryField.name}`);
  
  const mapping = decodeValidForMapping(stateField, countryField);
  
  if (!mapping) {
    console.warn(`⚠️ Could not create state-country mapping, using fallback approach`);
    return createFallbackMapping(stateField, countryField);
  }
  
  // Log mapping statistics
  const countryCount = Object.keys(mapping).length;
  const totalStateCombinations = Object.values(mapping).reduce((sum, states) => sum + states.length, 0);
  
  console.log(`✅ Created state-country mapping: ${countryCount} countries, ${totalStateCombinations} total state combinations`);
  
  return {
    mapping,
    countries: Object.keys(mapping),
    metadata: {
      stateField: stateField.name,
      countryField: countryField.name,
      countryCount,
      totalStateCombinations,
      created: new Date().toISOString()
    }
  };
}

/**
 * Create fallback mapping when validFor decoding fails
 * @param {Object} stateField - State field metadata
 * @param {Object} countryField - Country field metadata
 * @returns {Object} Simple mapping using all active values
 */
function createFallbackMapping(stateField, countryField) {
  console.log(`⚠️ Using fallback mapping for ${stateField.name} -> ${countryField.name}`);
  
  const countries = countryField.picklistValues?.filter(pv => pv.active)?.map(pv => pv.value) || [];
  const states = stateField.picklistValues?.filter(pv => pv.active)?.map(pv => pv.value) || [];
  
  // Create simple mapping where all states are valid for all countries
  const mapping = {};
  countries.forEach(country => {
    mapping[country] = [...states]; // Copy array for each country
  });
  
  return {
    mapping,
    countries,
    metadata: {
      stateField: stateField.name,
      countryField: countryField.name,
      countryCount: countries.length,
      totalStateCombinations: countries.length * states.length,
      fallback: true,
      created: new Date().toISOString()
    }
  };
}

/**
 * Get valid states for a specific country from decoded mapping
 * @param {string} countryValue - Country code/value
 * @param {Object} stateCountryMapping - Decoded mapping from createStateCountryMapping
 * @returns {string[]} Array of valid state codes for the country
 */
function getValidStatesForCountry(countryValue, stateCountryMapping) {
  if (!stateCountryMapping?.mapping) {
    return [];
  }
  
  return stateCountryMapping.mapping[countryValue] || [];
}

/**
 * Get a random valid state for a specific country
 * @param {string} countryValue - Country code/value
 * @param {Object} stateCountryMapping - Decoded mapping
 * @param {number} index - Record index for consistent selection
 * @returns {string|null} Valid state code or null if none available
 */
function getRandomStateForCountry(countryValue, stateCountryMapping, index = 0) {
  const validStates = getValidStatesForCountry(countryValue, stateCountryMapping);
  
  if (validStates.length === 0) {
    return null;
  }
  
  // Use index for consistent selection across multiple calls
  return validStates[index % validStates.length];
}

/**
 * Cache for decoded mappings to avoid repeated processing
 */
const mappingCache = new Map();

/**
 * Get or create cached state-country mapping
 * @param {string} cacheKey - Unique key for this mapping (e.g., sessionId + fieldNames)
 * @param {Object} stateField - State field metadata
 * @param {Object} countryField - Country field metadata
 * @returns {Object} Cached or newly created mapping
 */
function getCachedMapping(cacheKey, stateField, countryField) {
  if (mappingCache.has(cacheKey)) {
    console.log(`📋 Using cached state-country mapping: ${cacheKey}`);
    return mappingCache.get(cacheKey);
  }
  
  console.log(`🔄 Creating new state-country mapping: ${cacheKey}`);
  const mapping = createStateCountryMapping(stateField, countryField);
  
  // Cache for reuse
  mappingCache.set(cacheKey, mapping);
  
  // Clean up old cache entries (keep last 50)
  if (mappingCache.size > 50) {
    const firstKey = mappingCache.keys().next().value;
    mappingCache.delete(firstKey);
  }
  
  return mapping;
}

module.exports = {
  decodeValidForMapping,
  createStateCountryMapping,
  getValidStatesForCountry,
  getRandomStateForCountry,
  getCachedMapping,
  base64ToBinary // Export for testing
};