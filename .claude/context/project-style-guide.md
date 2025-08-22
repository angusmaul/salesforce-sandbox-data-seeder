---
created: 2025-08-22T03:37:36Z
last_updated: 2025-08-22T03:37:36Z
version: 1.0
author: Claude Code PM System
---

# Project Style Guide

## Code Style Standards

### TypeScript/JavaScript Conventions

#### Naming Conventions
```typescript
// Classes: PascalCase
class SalesforceConnector { }

// Interfaces: PascalCase with 'I' prefix (optional)
interface IDataGenerator { }

// Functions/Methods: camelCase
function generateTestData() { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;

// Variables: camelCase
let recordCount = 0;

// Private members: underscore prefix
private _connection: Connection;

// File names: kebab-case
// object-discovery.ts
// bulk-loader.ts
```

#### Code Organization
```typescript
// Import order
import { external } from 'package';        // 1. External packages
import { internal } from '../services';    // 2. Internal modules
import { Component } from './component';   // 3. Local imports
import type { Type } from './types';       // 4. Type imports

// Class member order
class Service {
  // 1. Static properties
  static readonly VERSION = '1.0.0';
  
  // 2. Instance properties
  private connection: Connection;
  
  // 3. Constructor
  constructor() { }
  
  // 4. Static methods
  static create() { }
  
  // 5. Public methods
  public connect() { }
  
  // 6. Protected methods
  protected validate() { }
  
  // 7. Private methods
  private initialize() { }
}
```

#### Function Style
```typescript
// Use async/await over promises
// Good
async function fetchData() {
  const result = await api.get();
  return result;
}

// Avoid
function fetchData() {
  return api.get().then(result => result);
}

// Use arrow functions for callbacks
array.map(item => item.value);

// Destructuring for clarity
function processRecord({ id, name, type }) {
  // Use destructured parameters
}
```

### Error Handling

#### Standard Pattern
```typescript
try {
  // Operation
  const result = await riskyOperation();
  return result;
} catch (error) {
  // Log with context
  logger.error('Operation failed', {
    operation: 'riskyOperation',
    error: error.message,
    stack: error.stack
  });
  
  // User-friendly message
  throw new Error('Unable to complete operation. Please try again.');
}
```

#### Custom Errors
```typescript
class ValidationError extends Error {
  constructor(field: string, value: any) {
    super(`Invalid value for field ${field}: ${value}`);
    this.name = 'ValidationError';
  }
}
```

### Comments & Documentation

#### JSDoc Standards
```typescript
/**
 * Generates test data for specified Salesforce objects
 * @param {string[]} objects - Array of object API names
 * @param {number} count - Number of records per object
 * @returns {Promise<GenerationResult>} Result with generated IDs
 * @throws {ValidationError} If objects are invalid
 * @example
 * const result = await generateData(['Account', 'Contact'], 10);
 */
async function generateData(objects: string[], count: number) {
  // Implementation
}
```

#### Inline Comments
```typescript
// Use comments for complex logic explanation
if (field.type === 'reference' && !field.referenceTo) {
  // Skip polymorphic fields as they require special handling
  continue;
}

// TODO: Implement retry logic for transient failures
// FIXME: Handle edge case when recordType is null
// NOTE: This is a workaround for Salesforce API limitation
```

### File Structure

#### Standard Module Template
```typescript
/**
 * @module services/data-generator
 * @description Handles generation of test data for Salesforce objects
 */

// Imports
import { dependencies } from 'external';

// Types
export interface IGeneratorOptions {
  // Interface definition
}

// Constants
const DEFAULT_BATCH_SIZE = 200;

// Main class/function
export class DataGenerator {
  // Implementation
}

// Helper functions
function validateInput() {
  // Helper implementation
}

// Exports
export { DataGenerator as default };
```

### Testing Conventions

#### Test File Structure
```typescript
// test-file.test.ts
describe('ComponentName', () => {
  // Setup
  beforeEach(() => {
    // Test setup
  });
  
  // Group related tests
  describe('methodName', () => {
    it('should handle normal case', () => {
      // Test implementation
    });
    
    it('should handle error case', () => {
      // Error test
    });
  });
  
  // Cleanup
  afterEach(() => {
    // Test cleanup
  });
});
```

#### Test Naming
```typescript
// Descriptive test names
it('should generate 10 Account records with valid data', () => {});
it('should throw ValidationError when object name is invalid', () => {});
it('should retry failed API calls up to 3 times', () => {});
```

### Git Conventions

#### Commit Messages
```
feat: Add bulk data loading support
fix: Resolve authentication timeout issue
docs: Update installation instructions
test: Add unit tests for data generator
refactor: Simplify connection management
chore: Update dependencies
```

#### Branch Naming
```
feature/bulk-loading
fix/auth-timeout
docs/installation-guide
test/data-generator
refactor/connection-logic
```

### Configuration Files

#### JSON Formatting
```json
{
  "name": "project-name",
  "version": "1.0.0",
  "config": {
    "option": true,
    "count": 10
  }
}
```

#### Environment Variables
```bash
# Salesforce Configuration
SF_LOGIN_URL=https://test.salesforce.com
SF_CLIENT_ID=your_client_id
SF_CLIENT_SECRET=your_client_secret

# Application Settings
LOG_LEVEL=info
MAX_RETRIES=3
BATCH_SIZE=200
```

### Project-Specific Patterns

#### Service Pattern
```typescript
// All services follow this pattern
export class ServiceName {
  private config: Config;
  private logger: Logger;
  
  constructor(config: Config) {
    this.config = config;
    this.logger = new Logger('ServiceName');
  }
  
  async initialize(): Promise<void> {
    // Initialization logic
  }
  
  async execute(): Promise<Result> {
    // Main execution logic
  }
  
  async cleanup(): Promise<void> {
    // Cleanup logic
  }
}
```

#### Error Messages
```typescript
// User-facing messages should be clear and actionable
"Unable to connect to Salesforce. Please check your credentials."
"Failed to generate data for Account. The object may not exist."
"Storage limit exceeded. Reduce the number of records and try again."

// Log messages should include context
logger.error('API call failed', { 
  endpoint: '/services/data/v59.0/sobjects/Account',
  status: 401,
  attempt: 2
});
```

### Performance Guidelines

#### Optimization Patterns
```typescript
// Use bulk operations
const results = await Promise.all(
  records.map(record => processRecord(record))
);

// Implement caching
const cache = new Map();
function getCachedData(key) {
  if (!cache.has(key)) {
    cache.set(key, fetchData(key));
  }
  return cache.get(key);
}

// Stream large datasets
const stream = fs.createReadStream(file);
stream.on('data', chunk => processChunk(chunk));
```

### Security Best Practices

#### Credential Handling
```typescript
// Never hardcode credentials
// Bad
const password = "abc123";

// Good
const password = process.env.SF_PASSWORD;

// Never log sensitive data
logger.info('Login successful', { 
  username: user.email,
  // Don't log: password, tokens, secrets
});
```

#### Input Validation
```typescript
// Always validate user input
function validateObjectName(name: string): boolean {
  const pattern = /^[A-Za-z][A-Za-z0-9_]*$/;
  return pattern.test(name) && name.length <= 40;
}
```

## Review Checklist

Before committing code, ensure:
- [ ] Code follows naming conventions
- [ ] Functions have JSDoc comments
- [ ] Error handling is comprehensive
- [ ] Tests are included for new features
- [ ] No hardcoded credentials
- [ ] Console.log statements removed
- [ ] TypeScript types are properly defined
- [ ] Code is formatted consistently
- [ ] Imports are organized correctly
- [ ] No unused variables or imports