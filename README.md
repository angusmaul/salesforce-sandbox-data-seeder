# Salesforce Sandbox Data Seeder

Discover a Salesforce org's data model and fill it with realistic, relationship-aware sample data — through a guided web wizard or a CLI.

Built for sandboxes and Developer Edition orgs: point it at your org, pick your objects, and it generates business-realistic records that respect your org's actual metadata — picklist dependencies, field constraints, and even your validation rules.

## Highlights

- **Guided 7-step wizard** — Connect → Discover → Select → Configure → Preview → Execute → Results, with live progress over WebSocket and a results dashboard (charts, error analysis, ZIP log export)
- **Saved org connections** — authenticate once with an External Client App; reconnect to any saved org with one click across sessions
- **Bring your own AI** — Anthropic, any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, LM Studio, vLLM), or **local Ollama**, configured on the Settings page or mid-wizard. The AI classifies fields into 60+ semantic categories so generated data is correlated (department ↔ job title, country ↔ phone format, name ↔ email…). Everything still works without AI via pattern-based generation.
- **Built-in AI assistant** — a chat panel in the wizard, powered by the same provider, that knows your session state (current step, connected org, selected objects) and helps with External Client App setup, OAuth errors, object selection, and load failures
- **Org-truth generation** — uses your org's real metadata: state/country picklist dependencies (decoded from `validFor` bitmaps), numeric precision/scale, restricted picklists, field lengths, dependency-ordered loading with real record IDs for lookups
- **Validation-rule aware** — reads your active rules' formulas and error messages, has the AI translate them into field constraints, and generates records that *satisfy* the rules. Rules it can't interpret are reported; a disable-and-restore option exists as a fallback.
- **Error-driven retry** — failed records are remediated per Salesforce error code (truncate, re-pick, uniquify, fill, drop) and resubmitted; fields that consistently cause failures are learned and skipped
- **Storage-aware** — reads your org's storage limits and recommends safe record counts
- **Deployable anywhere** — Docker Compose, LXC/systemd (guide included), or bare Node

## Quick start (Docker)

Prebuilt images — no clone needed:

```bash
curl -fO https://raw.githubusercontent.com/angusmaul/salesforce-sandbox-data-seeder/main/docker-compose.prebuilt.yml
curl -fo .env.example https://raw.githubusercontent.com/angusmaul/salesforce-sandbox-data-seeder/main/docker.env.example
[ -f .env ] || cp .env.example .env
# edit .env: set SESSION_SECRET (e.g. `openssl rand -hex 32`)
docker compose -f docker-compose.prebuilt.yml up -d
```

Images are on GHCR (`ghcr.io/angusmaul/salesforce-sandbox-data-seeder-{server,web}`), tagged `latest` and per release (pin with `IMAGE_TAG=1.1.0` in `.env`).

Or build from source:

```bash
git clone https://github.com/angusmaul/salesforce-sandbox-data-seeder.git
cd salesforce-sandbox-data-seeder
cp docker.env.example .env    # set SESSION_SECRET (e.g. `openssl rand -hex 32`)
docker compose up -d
```

Open **http://localhost:3000** (change with `WEB_PORT` in `.env`). The backend listens on **:3001** — the browser connects to it directly for live progress updates, so both ports must be reachable. Browsing from another machine? Set `CLIENT_URL` and `SERVER_URL` in `.env` to the host you browse to.

Using a local Ollama for AI? In the AI settings (Settings page or the wizard's Preview step), set the base URL to `http://host.docker.internal:11434` (the container can't see `localhost`).

## Salesforce setup

The tool authenticates with the **OAuth 2.0 Client Credentials Flow** via an External Client App:

1. In Salesforce Setup → Apps → External Client Apps → **New External Client App**
2. Enable OAuth; enable **Client Credentials Flow**; scope: *Access and manage your data (api)*
3. Assign an integration (run-as) user
4. Copy the Consumer Key and Secret into the wizard's Connect step — they're saved server-side as a reusable connection

Use your sandbox login URL (`https://test.salesforce.com`) or your org's My Domain URL.

## Local development

Requires Node.js 18+.

```bash
# Web app (Express backend :3001 + Next.js frontend :3000)
cd web
npm install
npm run dev

# CLI
npm install
npm run dev              # ts-node
npm run build            # compiled `sf-seed` in dist/
```

### CLI usage

```bash
# Configure once
npm start config set salesforce.clientId "your_client_id"
npm start config set salesforce.clientSecret "your_client_secret"

# Discover the data model
npm start discover --output data-model.json

# Seed interactively, by objects, or by preset
npm start seed --interactive
npm start seed --objects "Account,Contact,Lead" --records 50
npm start seed --preset sales-cloud --dry-run
```

Presets live in `config/presets/` (`core-objects`, `sales-cloud`, `minimal`, `custom-only`, `relationship-aware`).

## Configuration (web/.env)

All URLs default to localhost — a bare dev setup needs none of these.

| Variable | Purpose |
|---|---|
| `PORT` | Express backend port (default 3001) |
| `SERVER_URL` | Public base URL of the backend (OAuth callback URIs) |
| `CLIENT_URL` | Allowed CORS origin(s), comma-separated |
| `SERVER_INTERNAL_URL` | Next.js → backend proxy target (build-time in Docker) |
| `DATA_DIR` / `LOGS_DIR` | Writable state locations (auto-created; Docker mounts volumes) |
| `SESSION_SECRET` | Session signing secret (required in Docker) |
| `ANTHROPIC_API_KEY` | Optional fallback — AI providers are normally configured in the UI |
| `SF_CLIENT_ID` / `SF_CLIENT_SECRET` | Optional server-side Salesforce credentials |

## How generation works

1. **Discovery** filters ~1,200 org objects down to actual business data objects, then analyzes fields, relationships, and picklist dependencies for your selection
2. **AI classification** (optional, one pass) maps fields to semantic generators and identifies cross-field correlations
3. **Validation rules** are fetched and AI-interpreted into field constraints applied to every record
4. **Generation** walks objects in dependency order, building records from org metadata + the semantic library, with Faker.js as the base layer
5. **Loading** inserts via the REST sObject Collections API (chunked), retrying failures with per-error-code remediation
6. **Logs** — every run writes complete JSON audit logs (generated payloads, per-record results, retry history) to `logs/`, downloadable as a ZIP from the results screen

## Deployment

- **Docker Compose** — prebuilt images via [docker-compose.prebuilt.yml](docker-compose.prebuilt.yml), or build from source with [docker-compose.yml](docker-compose.yml); state persists in named volumes (`seed-data`, `seed-logs`)
- **LXC / systemd** — see [deploy/lxc/README.md](deploy/lxc/README.md) for a two-unit native install guide

## Safety notes

- Intended for **sandboxes and Developer Edition orgs** — don't point it at production
- Record counts are validated against your org's storage limits (80% threshold)
- The optional "skip validation rules" mode temporarily deactivates rules via the Metadata API and restores them afterwards (including on failure); prefer the default AI-constraint mode, which touches nothing
- Salesforce credentials and AI keys are stored server-side only (`0600` file mode, gitignored, never returned to the browser) — but they are stored in plaintext JSON, so treat the host/volume accordingly

## Testing

```bash
npm test                                          # CLI tests (ts-jest)
npx jest web/server                               # web server suites (plain JS)
```

## Contributing

Issues and PRs welcome. Fork, branch, make your change (with tests where it makes sense), and open a pull request. CodeRabbit automatically reviews non-draft PRs; address or discuss its findings before requesting human review.

## License

[MIT](LICENSE)
