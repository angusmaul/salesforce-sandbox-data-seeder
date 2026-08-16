# Web Application

The browser-based wizard for the Salesforce Sandbox Data Seeder. For product documentation, setup, and Docker deployment, see the [root README](../README.md).

## Stack

- **Backend** — Express (plain JavaScript, CommonJS) in `server/demo-server.js`, with Socket.IO for live progress. Runs on **:3001**.
- **Frontend** — Next.js + React + TypeScript + Tailwind. Runs on **:3000** and proxies `/api` and `/logs` to the backend via rewrites; only the Socket.IO connection goes direct.

## Development

```bash
npm install
npm run dev        # backend (nodemon) + frontend (next dev) together
```

All URLs default to localhost; see the root README for the environment variable reference. Server-side state (`.sessions.json`, `.connections.json`, `.ai-config.json`, `.preferences.json`) is written to `DATA_DIR` (default: this directory) and is gitignored.

## Layout

```
server/
  demo-server.js         # Express backend (routes, generation, loading)
  lib/                   # generation logic: field types, semantic library,
                         # picklist decoding, insert retry, field constraints
  services/              # AI provider adapters, field mapper, validation interpreter
  package.json           # runtime-only manifest used by the Docker server image
components/wizard/steps/ # the 7 wizard steps
components/ai/           # AI provider settings panel
pages/                   # Next.js pages (wizard.tsx is the main UI)
hooks/                   # useSession, useWebSocket
shared/types/            # TypeScript types shared across the frontend
```

## Tests

Run from the **repo root** (no jest config in `web/`):

```bash
npx jest web/server                # all server suites
npx jest web/server/lib/insert-retry.test.js --verbose
```

## Builds

```bash
npm run build      # next build (the Express server is plain JS — nothing to compile)
npm start          # runs backend + built frontend together
```

Docker images build from `Dockerfile.server` (backend, uses `server/package.json`) and `Dockerfile.web` (Next.js standalone output) — see the root `docker-compose.yml`.
