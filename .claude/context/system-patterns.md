---
created: 2025-08-22T03:37:36Z
last_updated: 2025-08-22T03:37:36Z
version: 1.0
author: Claude Code PM System
---

# System Patterns

## Architectural Style

### Overall Architecture
- **Pattern**: Modular Service Architecture
- **Separation**: Clear separation between CLI, Web, and Core Services
- **Communication**: Direct function calls within process, WebSocket for real-time updates

### Design Principles
1. **Single Responsibility**: Each service handles one aspect (auth, discovery, loading)
2. **Dependency Injection**: Configuration passed through constructors
3. **Interface Segregation**: TypeScript interfaces define contracts
4. **Error Propagation**: Errors bubble up with context preservation

## Core Design Patterns

### Service Layer Pattern
```typescript
// Services encapsulate business logic
services/
├── salesforce.ts      // External API integration
├── object-discovery.ts // Schema analysis
├── bulk-loader.ts     // Data operations
└── config.ts          // Settings management
```

### Command Pattern
- CLI commands as discrete operations
- Each command in separate module
- Shared context through configuration

### Factory Pattern
- Data generation using Faker.js
- Dynamic object creation based on schema
- Contextual data relationships

### Observer Pattern
- WebSocket for progress updates
- Event-driven status notifications
- Real-time UI synchronization

## Data Flow Patterns

### Discovery Flow
1. **Authentication** → Salesforce connection
2. **Schema Fetch** → Metadata API calls
3. **Analysis** → Relationship mapping
4. **Filtering** → Smart object selection
5. **Storage** → Local cache/configuration

### Data Generation Flow
1. **Schema Load** → Read discovered metadata
2. **Hierarchy Build** → Dependency ordering
3. **Data Creation** → Faker.js generation
4. **Relationship Link** → ID mapping
5. **Bulk Insert** → REST API operations

### Error Handling Pattern
```javascript
try {
  // Operation
} catch (error) {
  // Log with context
  // Graceful degradation
  // User-friendly message
  // Recovery options
}
```

## Integration Patterns

### Salesforce Integration
- **Adapter Pattern**: JSForce wraps Salesforce APIs
- **Connection Pooling**: Reuse authenticated connections
- **Retry Logic**: Automatic retry with backoff
- **Rate Limiting**: Respect API limits

### Configuration Management
- **Singleton Pattern**: Single config instance
- **Persistent Storage**: Using `conf` library
- **Environment Override**: ENV vars take precedence
- **Default Values**: Sensible defaults provided

## Asynchronous Patterns

### Promise-Based Operations
- All API calls return promises
- Async/await for clean syntax
- Parallel operations where possible
- Sequential when dependencies exist

### Progress Tracking
```javascript
// WebSocket updates
socket.emit('progress', {
  phase: 'discovery',
  current: 10,
  total: 100,
  message: 'Analyzing objects...'
});
```

## State Management

### Session State
- Web: Browser session storage
- CLI: In-memory during execution
- Persistent: Config file storage

### Connection State
- Lazy initialization
- Connection validation
- Automatic reconnection
- Credential refresh

## Code Organization Patterns

### Module Structure
- **Exports**: Named exports for utilities
- **Default**: Default export for services
- **Types**: Separate type definitions
- **Interfaces**: Contract definitions

### File Organization
```
feature/
├── index.ts        // Public API
├── types.ts        // Type definitions
├── service.ts      // Business logic
├── utils.ts        // Helper functions
└── constants.ts    // Configuration
```

## Testing Patterns

### Test Organization
- Unit tests mirror source structure
- Integration tests at root level
- Mock services for isolation
- Real API tests with sandbox

### Test Data Patterns
- Fixtures for consistent data
- Factories for dynamic generation
- Snapshots for UI components

## Security Patterns

### Credential Management
- Never in code
- Environment variables
- Secure config storage
- Session-only in browser

### API Security
- OAuth 2.0 flow
- Token refresh logic
- Scope limitation
- Sandbox-only enforcement

## Performance Patterns

### Optimization Strategies
- Bulk operations over individual
- Pagination for large datasets
- Streaming for real-time data
- Caching for repeated calls

### Memory Management
- Stream processing for large files
- Garbage collection awareness
- Resource cleanup in finally blocks

## Logging Patterns

### Structured Logging
```javascript
logger.info('Operation completed', {
  operation: 'discovery',
  duration: 1234,
  objects: 50,
  success: true
});
```

### Log Levels
- ERROR: Failures requiring attention
- WARN: Potential issues
- INFO: Normal operations
- DEBUG: Detailed troubleshooting