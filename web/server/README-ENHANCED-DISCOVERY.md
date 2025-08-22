# Enhanced Discovery Service

The Enhanced Discovery Service extends the existing Salesforce object discovery functionality with validation rule extraction and AI analysis capabilities.

## Features

- **Validation Rule Extraction**: Fetches validation rules from Salesforce Metadata API
- **Formula Parsing**: Analyzes validation rule formulas to extract field dependencies
- **Schema Anonymization**: Protects sensitive org data before AI processing
- **Performance Caching**: Caches validation rule analysis for improved performance
- **AI Integration Ready**: Prepares schema data for Claude API analysis

## Usage

### Basic Enhanced Discovery

```typescript
import { EnhancedDiscoveryService } from './services/enhanced-discovery';
import { SalesforceService } from '../../src/services/salesforce';

const salesforceService = new SalesforceService();
await salesforceService.setAccessToken(accessToken, instanceUrl);

const enhancedDiscovery = new EnhancedDiscoveryService(salesforceService);

// Discover objects with validation rules
const objects = await enhancedDiscovery.discoverObjectsWithValidation({
  includeValidationRules: true,
  includeSchemaAnalysis: true,
  anonymizeForAI: false,
  cacheResults: true
});
```

### API Endpoints

#### Start Enhanced Discovery
```
POST /api/discovery/enhanced/start/:sessionId
```
Body:
```json
{
  "includeValidationRules": true,
  "includeSchemaAnalysis": true,
  "anonymizeForAI": false,
  "cacheResults": true
}
```

#### Get Enhanced Object Details
```
GET /api/discovery/enhanced/object/:sessionId/:objectName?includeValidationRules=true&includeSchemaAnalysis=true
```

#### Create AI Schema Summary
```
POST /api/discovery/enhanced/ai-summary/:sessionId
```
Body:
```json
{
  "objectNames": ["Account", "Contact", "CustomObject__c"]
}
```

#### Get Validation Analysis
```
GET /api/discovery/enhanced/validation-analysis/:sessionId?objectNames=Account,Contact
```

## Data Structures

### ValidationRuleMetadata
```typescript
interface ValidationRuleMetadata {
  id: string;
  fullName: string;
  active: boolean;
  description?: string;
  errorConditionFormula: string;
  errorMessage: string;
  validationName: string;
  fields?: string[]; // Fields referenced in the rule
  dependencies?: FieldDependency[];
  complexity: 'simple' | 'moderate' | 'complex';
  riskLevel: 'low' | 'medium' | 'high';
}
```

### SchemaAnalysis
```typescript
interface SchemaAnalysis {
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
```

## Validation Rule Parser

The validation rule parser analyzes Salesforce validation rule formulas to extract:

- **Field References**: All fields referenced in the formula
- **Dependencies**: Conditional relationships between fields
- **Complexity Assessment**: Simple, moderate, or complex based on formula characteristics
- **Risk Level**: Low, medium, or high based on potential data generation challenges
- **Patterns**: Common validation patterns (required fields, date validation, etc.)

### Example

```javascript
const parsed = parseValidationRuleFormula(
  'IF(Type = "Customer", ISBLANK(Industry), false)',
  'Account'
);

// Result:
// {
//   fields: ['Type', 'Industry'],
//   dependencies: [{
//     sourceField: 'Type',
//     targetField: 'Industry',
//     type: 'required_if',
//     condition: 'Type = "Customer"'
//   }],
//   complexity: 'moderate',
//   riskLevel: 'medium',
//   patterns: ['CONDITIONAL_REQUIREMENT']
// }
```

## Schema Anonymization

The schema anonymizer protects sensitive organizational data while preserving structure for AI analysis:

- **Field Names**: Custom fields anonymized (e.g., `Custom_Field__c` → `CustomField_a1b2c3__c`)
- **Object Names**: Custom objects anonymized (e.g., `My_Object__c` → `CustomObject_d4e5f6__c`)
- **Standard Objects/Fields**: Preserved by default for AI understanding
- **Validation Logic**: Structure preserved while anonymizing field references
- **Relationships**: Maintained while anonymizing names

### Example

```javascript
const anonymized = anonymizeObjectSchema(originalObject, {
  preserveStandardObjects: true,
  preserveStandardFields: true,
  includeFieldTypes: true,
  includeValidationRules: true
});
```

## Cache Management

The service includes intelligent caching to improve performance:

- **Validation Rules**: Cached per object with configurable TTL
- **Schema Analysis**: Cached analysis results
- **Automatic Cleanup**: Expired entries cleaned up periodically
- **Memory Management**: Configurable cache limits

### Cache Operations

```typescript
// Get cache statistics
const stats = enhancedDiscovery.getCacheStats();

// Clear cache
enhancedDiscovery.clearCache();

// Cleanup resources (for testing)
enhancedDiscovery.destroy();
```

## Error Handling

The service includes robust error handling:

- **API Failures**: Graceful degradation when Metadata API is unavailable
- **Fallback Mechanisms**: Uses Tooling API as fallback for validation rules
- **Formula Parsing**: Handles malformed or complex formulas gracefully
- **Partial Results**: Returns partial results when some objects fail

## Integration with Claude API

The enhanced discovery service prepares data for AI analysis:

1. **Schema Anonymization**: Protects sensitive data while preserving structure
2. **Structured Output**: Formats data for optimal AI processing
3. **Context Preservation**: Maintains relationships and validation logic
4. **Summary Generation**: Creates concise summaries for AI consumption

## Performance Considerations

- **Batch Processing**: Objects processed in configurable batches
- **Caching**: Aggressive caching of expensive operations
- **Progressive Enhancement**: Falls back gracefully when features unavailable
- **Memory Management**: Efficient cache cleanup and resource management

## Future Enhancements

- **Advanced Pattern Recognition**: More sophisticated validation pattern analysis
- **Cross-Object Dependencies**: Analysis of dependencies across multiple objects
- **Performance Optimization**: Further optimization of large org discovery
- **AI Integration**: Direct integration with Claude API for real-time analysis