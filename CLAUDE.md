# Salesforce Sandbox Data Seeder

## Project Overview

A tool for discovering Salesforce sandbox data models and generating realistic sample data for testing and development. Provides both a CLI interface and a web-based wizard with real-time progress tracking.

## Architecture

### Two Entry Points

1. **CLI** (`src/index.ts`) — Commander.js CLI, compiled to `dist/index.js`, binary name `sf-seed`
2. **Web** (`web/`) — Next.js frontend (port 3000) + Express.js backend (port 3001)

### Directory Layout

```
src/                          # CLI tool (TypeScript, CommonJS)
  commands/                   # discover, seed, config commands
  generators/data-generator.ts  # FieldDataGenerator class
  models/salesforce.ts        # Core type definitions
  services/                   # Salesforce API, discovery, bulk loading
web/
  pages/                      # Next.js pages (wizard.tsx is the main UI)
  components/wizard/steps/    # 7-step wizard: Auth → Discovery → Selection → Config → Preview → Execution → Results
  hooks/                      # useSession, useWebSocket
  server/
    demo-server.js            # Express backend monolith (~4300 lines)
    lib/
      salesforce-field-types.js   # FieldDataGenerator, AIPlanGenerator, WESTERN_COUNTRIES_DATA
      field-data-library.js       # Semantic generators by category, correlation maps
      picklist-decoder.js         # Picklist value decoding
    services/
      ai-field-mapper.js          # Claude Haiku field classification
  shared/types/api.ts         # Shared types — re-exports from src/models/salesforce
config/presets/               # Object selection presets (sales-cloud, minimal, etc.)
```

### Key Components

- **PersistentStorage** — File-based JSON session storage (`.sessions.json`). `sessions.set(key, value)` auto-saves; there is no manual save method.
- **FieldDataGenerator** (`salesforce-field-types.js`) — Core data generation using Faker.js with field-type-aware logic.
- **AIPlanGenerator** (`salesforce-field-types.js`) — Wraps field-data-library with fallback to FieldDataGenerator when AI plan is unavailable.
- **AI Field Mapper** (`ai-field-mapper.js`) — Uses Claude Haiku to classify Salesforce fields into semantic categories via batched analysis.
- **Field Data Library** (`field-data-library.js`) — 8 categories, 66 subcategories of semantic generators with correlation maps.

## Development

### Setup

```bash
# CLI
npm install
npm run dev              # Run CLI via ts-node

# Web
cd web
npm install
cp .env.example .env     # Configure environment variables
npm run dev              # Starts both server (3001) and client (3000)
```

### Environment Variables (web/.env)

```
PORT=3001
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
CLIENT_URL=http://localhost:3000
SF_CLIENT_ID=...
SF_CLIENT_SECRET=...
ANTHROPIC_API_KEY=...       # Optional, enables AI field classification
```

### Running Tests

```bash
# Root (CLI tests) — uses jest.config.js with ts-jest preset
npm test

# Web server tests — plain JS, run directly
npx jest web/server/lib/field-data-library.test.js --verbose
npx jest web/server/services/ai-field-mapper.test.js --verbose
```

There is no jest config in `web/`; web server tests are plain JS and run with `npx jest <path> --verbose` from the project root.

### Build

```bash
# CLI
npm run build            # tsc → dist/

# Web
cd web
npm run build            # server:build + client:build
npm start                # Runs compiled server
```

## Code Conventions

### Language Split
- **Server files** (`web/server/`): Plain JavaScript (CommonJS `require`)
- **Frontend** (`web/pages/`, `web/components/`): TypeScript React
- **CLI** (`src/`): TypeScript (CommonJS output)

### API Endpoints
All web API endpoints follow the pattern: `app.get|post|put('/api/<domain>/<action>/:sessionId')`

Key endpoint groups:
- `/api/auth/*` — OAuth client credentials, status
- `/api/discovery/*` — Object and field discovery
- `/api/selection/*` — Object selection and analysis
- `/api/config/*` — Configuration management
- `/api/execution/*` — Data loading execution and results
- `/api/generation/*` — Generation plan and preview
- `/api/ai/*` — AI classification, plan management, categories
- `/api/logs/*` — Log download

### Data Generation Pipeline
Three-layer approach:
1. **AI classification** (Claude Haiku) — Analyzes field schemas once, assigns semantic categories
2. **Semantic library lookup** — Generates correlated data by category (department/job title, country/phone format, etc.)
3. **Fallback** — Generic Faker.js generation via FieldDataGenerator

Correlation context is built per-record via `buildCorrelatedContext()` and passed through `_correlatedCtx` on `recordContext`.

### Session Management
- Sessions stored in memory + file (`.sessions.json`)
- OAuth configs persisted in `.oauth-configs.json`
- AI plans cached in `session.aiGenerationPlan`, profiles in `session.aiCompanyProfile`
- 24-hour expiration cleanup

## Important Patterns

- `WESTERN_COUNTRIES_DATA` in `salesforce-field-types.js` defines AU, US, CA, GB with state/province codes
- State/Country text fields are skipped when corresponding code fields exist (Salesforce auto-populates text from codes)
- `isSystemField()` is object-aware — Contact/Lead `LastName` and `FirstName` are not treated as system fields
- Reference fields use previously generated record IDs for parent-child relationships
- Download functionality uses `window.location.href` (not `window.open`) to avoid popup blockers
- WebSocket (Socket.IO) provides real-time progress updates during execution

## Node.js Requirements
- CLI: Node.js >= 16
- Web: Node.js >= 18
