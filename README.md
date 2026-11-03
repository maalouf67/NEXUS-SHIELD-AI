# NEXUS SHIELD AI

NEXUS SHIELD AI is an actively developed cyber-defense platform foundation combining a web console, API services, evidence-aware graph analysis, and AI-assisted security analysis.

## Current implementation status

- The Attack Path Intelligence engine performs bounded, deterministic, read-only graph traversal over asset relationships supplied by a caller.
- The API exposes that engine through a service-token-protected endpoint. It does not scan devices, discover assets, execute security actions, or prove exploitability.
- The cost-incurring AI threat-analysis endpoint also requires the same server-side service token; the dashboard does not trigger AI requests automatically.
- The threat summary and dashboard examples are demo data, not live security telemetry.
- AI threat analysis evaluates information explicitly supplied to the API. It is not a system scan or incident confirmation.
- Authentication for human dashboard users, live telemetry ingestion, and automated response are not yet production-ready.
- A PostgreSQL-backed asset inventory API now supports authenticated, transactional upserts and read-only analysis of stored relationships.

Do not describe sample data or planned capabilities as active protection.

## Architecture

- Frontend: Next.js web/admin console
- API: Node.js, TypeScript, Express, and Zod
- AI engine: Python + FastAPI and the OpenAI Responses API
- AI application layer: typed threat-analysis agent
- Data: PostgreSQL
- Security baseline: Helmet, CORS allow-list, request validation, API rate limiting, environment validation, and protected service-to-service route access

## Local configuration

1. Copy `.env.example` to the repository root as `.env` for Docker Compose.
2. Copy `.env.example` to `services/api/.env` for the API process.
3. Replace the empty database password and both secret placeholders with unique values. The `DATABASE_URL` password must match `POSTGRES_PASSWORD`; URL-encode reserved characters in the URL.
4. Generate strong secrets locally, for example:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

5. For local Docker PostgreSQL, keep `DATABASE_SSL=false`. For remote PostgreSQL, enable TLS and configure a trusted CA path when the provider requires one.
6. The optional `NEXUS_SERVICE_API_TOKEN` must be at least 32 characters. Configure it only in the API server environment. Never expose it through `apps/web/.env.local` or client-side code.
7. Set `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local` to the API URL reachable by the browser.

Never commit populated `.env`, `.env.local`, API keys, passwords, or service tokens.

## Local PostgreSQL

Start the local database only after setting a strong `POSTGRES_PASSWORD` in the root `.env`:

```bash
docker compose up -d postgres
```

PostgreSQL and Adminer bind to `127.0.0.1` only. Adminer is available locally at `http://127.0.0.1:8080`.

The API database pool supports explicit local non-TLS mode and verified TLS mode. When using the bundled Supabase CA or another provider CA, set `DATABASE_SSL=true` and configure `DATABASE_SSL_CA_PATH` where appropriate.

## JavaScript services

Install dependencies from the repository root:

```bash
npm install
```

The root development script starts multiple services. Review its bind addresses and configure local-only access before using it on a shared network.

## Python AI service

Install dependencies in `services/ai` and run the service from a trusted local development environment:

```bash
cd services/ai
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Configure `OPENAI_API_KEY` as a server-side environment variable. Never put it in frontend configuration.

## Attack Path Intelligence API

`POST /api/attack-paths/analyze` accepts a bounded graph of assets, directed relationships, and evidence references.

The attack-path endpoint and the cost-incurring AI threat-analysis endpoint require:

```
Authorization: Bearer <NEXUS_SERVICE_API_TOKEN>
```

The service token is optional at startup, but all protected inventory, graph-analysis, and AI-analysis routes fail closed with `503 SERVICE_AUTH_NOT_CONFIGURED` until a token of at least 32 characters is configured. Invalid or missing credentials receive `401`.

Safety limits are enforced at the API boundary: up to 500 assets, 2,000 relationships, 20 evidence records per asset/relationship, traversal depth up to 8, and up to 100 returned paths. Duplicate identifiers and unknown request fields are rejected.

The response explicitly marks the operation as read-only, confirms that no external scan ran, and states that results are potential graph paths rather than proof of compromise or exploitability. Submitted graph data is not persisted by this endpoint.

## Persistent asset inventory API

The API also exposes a PostgreSQL-backed inventory. These endpoints require the same bearer service token:

- `POST /api/assets/inventory/import` — validates and transactionally upserts a batch of assets, relationships, and evidence records. It never deletes records omitted from a request.
- `GET /api/assets/inventory` — reads the saved inventory.
- `POST /api/attack-paths/analyze-inventory` — runs the read-only graph engine against the saved inventory. It does not scan external systems or change database records.

The inventory schema is defined in `database/init/002_attack_path_inventory.sql`. It is included in Docker's initialization directory for new databases. For an existing database, back it up and apply the migration once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init/002_attack_path_inventory.sql
```

The database must be reachable by the API and the migration must be applied before using persistent inventory endpoints. A successful HTTP route response alone does not prove that a database has been initialized.

This is a service-to-service integration surface, not a substitute for end-user authentication or authorization. Keep it on trusted infrastructure until the platform's user identity and RBAC layer is implemented.

## Checks

The API package exposes:

```bash
npm run build --workspace @nexus-shield/api
npm test --workspace @nexus-shield/api
```

Run these checks in the project environment before treating a change as verified. Checks not executed must not be reported as passing.

## Project structure

```text
.
├── apps/web
├── services/api
├── services/ai
├── packages/shared
├── database
├── docs
├── docker-compose.yml
└── package.json
```
