---
created: 2025-08-22T03:37:36Z
last_updated: 2025-08-22T03:37:36Z
version: 1.0
author: Claude Code PM System
---

# Technology Context

## Primary Technology Stack

### Core Language & Runtime
- **Node.js**: >=16.0.0 (Required)
- **TypeScript**: 5.3.2
- **JavaScript**: ES6+ features

### Frameworks & Libraries

#### Core Dependencies
- **jsforce**: ^3.10.0 - Salesforce API integration
- **@faker-js/faker**: ^8.4.1 - Realistic data generation
- **commander**: ^11.1.0 - CLI framework
- **inquirer**: ^9.2.12 - Interactive CLI prompts
- **chalk**: ^4.1.2 - Terminal string styling
- **ora**: ^5.4.1 - Terminal spinners
- **conf**: ^10.2.0 - Configuration management
- **@modelcontextprotocol/sdk**: ^1.17.2 - MCP integration

#### Development Dependencies
- **TypeScript Tooling**:
  - typescript: ^5.3.2
  - ts-node: ^10.9.1
  - @types/node: ^20.10.0
  - @types/inquirer: ^9.0.7
  - @types/jest: ^29.5.8

- **Testing Framework**:
  - jest: ^29.7.0
  - ts-jest: ^29.1.1

- **Code Quality**:
  - eslint: ^8.54.0
  - @typescript-eslint/parser: ^6.13.0
  - @typescript-eslint/eslint-plugin: ^6.13.0

- **Build Tools**:
  - rimraf: ^5.0.5 (Clean utility)

## Build & Development Tools

### Package Management
- **NPM**: Primary package manager
- **package-lock.json**: Locked dependencies

### Build System
- **TypeScript Compiler** (tsc)
- Output directory: `dist/`
- Source maps enabled for debugging

### Scripts
```json
{
  "build": "tsc",
  "dev": "ts-node src/index.ts",
  "start": "node dist/index.js",
  "test": "jest",
  "lint": "eslint src/**/*.ts",
  "clean": "rimraf dist"
}
```

## External Integrations

### Salesforce Platform
- **Authentication**: OAuth 2.0 Client Credentials Flow
- **APIs Used**:
  - REST API for data operations
  - Metadata API for schema discovery
  - Bulk API for large data operations
- **External Client App**: Required for authentication

### Model Context Protocol (MCP)
- Server implementation for AI integration
- Configuration in `mcp-config.json`
- Custom server at `mcp-jam-server.js`

### GitHub Integration
- Repository: https://github.com/automazeio/ccpm.git
- GitHub CLI (gh) for PM operations
- Issue and PR management via CCPM

## Development Environment

### IDE Configuration
- TypeScript support required
- ESLint integration recommended
- Jest test runner support

### Required Environment Variables
- Salesforce credentials (various methods supported)
- OAuth client credentials
- Instance URL configuration

### Browser Requirements (Web Interface)
- Modern browser with WebSocket support
- JavaScript enabled
- Session storage for credentials

## Testing Infrastructure

### Test Framework
- **Jest**: Primary test runner
- **ts-jest**: TypeScript preprocessor
- Configuration in `jest.config.js`

### Test Organization
- Unit tests in `tests/` directory
- Integration tests at root level
- Test utilities and mocks available

## Deployment Considerations

### CLI Tool
- Distributable via NPM
- Binary name: `sf-seed`
- Cross-platform compatibility

### Web Interface
- Static file serving
- WebSocket server for real-time updates
- Session management for credentials

### Performance Optimizations
- Bulk API for large data operations
- Streaming for progress updates
- Efficient memory management for large schemas

## Security Considerations
- Secure credential storage using `conf`
- OAuth 2.0 for authentication
- No production org support (sandbox only)
- Session-based credential management in web interface

## Version Control
- Git for source control
- Conventional commits recommended
- Feature branch workflow