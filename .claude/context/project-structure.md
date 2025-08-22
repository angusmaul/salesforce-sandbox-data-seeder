---
created: 2025-08-22T03:37:36Z
last_updated: 2025-08-22T03:37:36Z
version: 1.0
author: Claude Code PM System
---

# Project Structure

## Root Directory Organization

```
/
├── .claude/           # Claude Code PM system files
│   ├── context/       # Project context documentation
│   ├── scripts/       # PM automation scripts
│   └── rules/         # Development rules and guidelines
│
├── src/               # Source code directory
│   ├── commands/      # CLI command implementations
│   ├── services/      # Core business logic services
│   ├── utils/         # Utility functions
│   ├── web/           # Web interface source
│   └── index.ts       # Main entry point
│
├── web/               # Web interface static files
│   ├── assets/        # Static assets (CSS, JS, images)
│   ├── components/    # Web UI components
│   └── index.html     # Main web interface
│
├── dist/              # Compiled JavaScript output
│   └── [compiled files]
│
├── config/            # Configuration files
│   └── [environment configs]
│
├── tests/             # Test suite directory
│   └── [test files]
│
├── logs/              # Application logs
│   └── [session logs]
│
├── ccpm/              # CCPM integration files
│   └── [ccpm specific files]
│
└── node_modules/      # NPM dependencies
```

## Key Files

### Configuration Files
- `package.json` - Node.js project manifest
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Jest testing configuration
- `.eslintrc.json` - ESLint code quality rules
- `.gitignore` - Git ignore patterns
- `mcp-config.json` - MCP server configuration

### Documentation
- `README.md` - Main project documentation
- `CCPM-README.md` - CCPM system documentation
- `CLAUDE.md` - Claude AI assistant rules
- `COMMANDS.md` - Available commands documentation
- `AGENTS.md` - Agent system documentation
- `LICENSE` - MIT license file

### Test Files (Root Level)
- `test-*.js` - Various test scenarios for debugging
- `demo-mode.js` - Demo mode implementation

### Data Files
- `*.json` - Various schema and analysis files
- `object-lists.json` - Salesforce object definitions
- `account-fields.json` - Account field mappings
- `org-schema.json` - Organization schema
- `*-analysis.json` - Various analysis outputs

### Entry Points
- `src/index.ts` - Main CLI application entry
- `mcp-jam-server.js` - MCP server implementation
- `web/index.html` - Web interface entry

## Module Organization

### Services (`/src/services/`)
- `salesforce.ts` - Salesforce API integration
- `bulk-loader.ts` - Bulk data loading logic
- `object-discovery.ts` - Schema discovery service
- `config.ts` - Configuration management
- `load-logger.ts` - Logging service

### Commands (`/src/commands/`)
- CLI command implementations
- Interactive prompts and workflows

### Utils (`/src/utils/`)
- Helper functions
- Common utilities
- Data formatting

### Web Interface (`/web/`)
- Static HTML/CSS/JS files
- Client-side components
- WebSocket integration

## File Naming Conventions
- TypeScript source: `*.ts`
- JavaScript files: `*.js`
- Type definitions: `*.d.ts`
- Test files: `test-*.js`, `*.test.ts`
- Configuration: `*.config.js`, `*.json`
- Documentation: `*.md`

## Build Artifacts
- Source TypeScript → `dist/` JavaScript
- Maintains directory structure in output
- Type definitions generated alongside

## Data Flow
1. CLI/Web entry points
2. Commands/Routes layer
3. Services layer (business logic)
4. Salesforce API integration
5. Data persistence/logging