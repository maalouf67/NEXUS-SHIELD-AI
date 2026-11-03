# NEXUS SHIELD AI

NEXUS SHIELD AI is an actively developed cyber-defense platform foundation combining a web console, API services, evidence-aware graph analysis, and AI-assisted security analysis.

## Current implementation status

- The Attack Path Intelligence engine performs bounded, deterministic, read-only graph traversal over asset relationships supplied by a caller.
- The API exposes that engine through a service-token-protected endpoint. It does not scan devices, discover assets, execute security actions, or prove exploitability.
- The cost-incurring AI threat-analysis endpoint also requires the same server-side service token; the dashboard does not trigger AI requests automatically.
- The threat summary and dashboard examples are demo data, not live security telemetry.
- AI threat analysis evaluates information explicitly supplied to the API. It is not a system scan or incident confirmation.
- API bearer authentication and admin/analyst/viewer role checks are implemented. The web dashboard includes an initial authenticated flow and team management. A normalized event ingestion endpoint is ready for trusted upstream sources, but provider-specific connectors, live source configuration, and automated response are not yet in place.
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

## Web sign-in and secure API proxy

The Next.js web console now includes a sign-in screen at `/login`. The browser posts credentials to the same-origin Next.js route. The BFF sends them to the API server, then stores the short-lived JWT in an `HttpOnly`, `SameSite=Strict` cookie. The JWT is not returned to browser JavaScript or stored in local storage.

The browser calls the same-origin `/api/nexus/*` proxy. The proxy forwards only allow-listed incidents, alerts, and threat-summary requests with the session bearer token. It applies an Origin check to state-changing requests and never accepts an arbitrary upstream URL from the browser.

For local development, create `apps/web/.env.local` and set:

```env
NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:4000"
```

The BFF reads this value server-side as a fallback when `API_BASE_URL` is not set. The API's CORS allow-list is empty by default because browser requests use the same-origin BFF; leave `ALLOWED_ORIGINS` empty unless a separately authorized browser origin must call the API directly. For hosted environments, prefer a server-only `API_BASE_URL` value and keep secrets out of `NEXT_PUBLIC_*` variables. The JWT cookie expires after 15 minutes; sign-out clears the browser cookie. Because the API uses short-lived stateless access tokens, a signed-out token may remain cryptographically valid until its expiry, but the browser no longer retains it.

## Human user authentication and roles

The API provides short-lived JWT bearer access tokens:

- `POST /api/auth/login` — accepts an email and password, then issues a 15-minute access token.
- `GET /api/auth/me` — returns the identity and role encoded in a valid token.
- `GET /api/users` — admin-only user directory.
- `POST /api/users` — admin-only creation of analyst or viewer accounts. Public self-registration and HTTP promotion to admin are deliberately disabled.

Every new user password is hashed with bcrypt before storage. Failed login responses do not reveal whether an email address exists. Login attempts are rate-limited. Tokens are signed with `JWT_SECRET` and restricted to the HS256 algorithm, issuer, audience, and expiry.

### Apply the user authentication migration

The schema is in `database/init/003_user_auth.sql`. Docker applies it automatically only when it initializes a new database. For an existing database, back it up and apply the migration once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init/003_user_auth.sql
```

### Create the first administrator

There is no public admin signup endpoint. After applying migration 003, set `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters in the API environment, then run the one-time command from the repository root:

```bash
npm run bootstrap:admin --workspace @nexus-shield/api
```

The command refuses to run if an admin account already exists. It stores only a bcrypt hash. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the environment immediately after successful provisioning. Never commit the value.

The user-management API can create analyst and viewer accounts after an administrator signs in. Admin promotion remains a controlled provisioning operation, not a normal API request.

The web dashboard now includes an initial sign-in screen, an HttpOnly cookie session, and a same-origin server-side API proxy. Treat this as an initial authenticated dashboard implementation, not a production-certified identity platform. Before production use, complete an independent security review of the session and CSRF design, add session revocation and refresh handling, and consider MFA. Never put the service token, JWT signing secret, or AI provider key in browser-visible configuration.

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

## Incident management API

The authenticated incident API is available to admin, analyst, and viewer roles for reading:

- `GET /api/incidents` — filter by status or severity, with bounded pagination.
- `GET /api/incidents/:id` — returns the incident, related alerts, and up to the latest 100 audit activities.

Admin and analyst roles can also:

- `POST /api/incidents` — create an incident with a title, severity, and optional source.
- `PATCH /api/incidents/:id/status` — change the incident status through allowed transitions.

Every incident creation and status change is recorded in `incident_activity` in the same database transaction as the incident change. Status changes use row-level locking to prevent concurrent updates from silently overwriting one another. Reopening resolved or closed incidents is restricted to admins. Viewing is read-only; this API does not run containment, scans, or automated remediation actions.

The schema is in `database/init/004_incident_management.sql`. Docker applies it automatically only when creating a new database. For an existing database, back it up and apply the migration once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init/004_incident_management.sql
```

## Alert review API

The authenticated alert API provides:

- `GET /api/alerts` — list alerts with status, minimum risk score, and bounded pagination filters. Viewers can read.
- `POST /api/incidents/:id/alerts` — admin and analyst roles can record an alert from information they submit. The request includes a type and an integer risk score from 0–100.
- `PATCH /api/alerts/:id/status` — admin and analyst roles can acknowledge or resolve alerts through allowed transitions. Reopening a resolved alert is admin-only.

Alert creation and status changes are recorded in the linked incident audit history within the same database transaction. These endpoints record analyst-supplied information; they do not collect telemetry, verify a threat, run a scan, or perform containment.

The alert-to-audit link is added by `database/init/005_alert_audit_link.sql`. For an existing database, back it up and apply the migration once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init/005_alert_audit_link.sql
```

## Normalized security event ingestion

Trusted upstream security tools can send normalized events to:

`POST /api/integrations/security-events`

The route requires the dedicated `NEXUS_EVENT_INGESTION_TOKEN` in the `X-NEXUS-INGESTION-TOKEN` header. This secret is separate from the service token and user JWT signing secret. Keep it on the API server and trusted connector only. If it is absent or shorter than 32 characters, ingestion fails closed with `503`.

The request contains an `events` array of 1–100 normalized records. Each record includes a source identifier, source event ID, event type, severity, observed timestamp, summary, optional asset ID, and at most 20 string attributes. Batch size is bounded by the API's 1 MB JSON body limit. Source and external event ID form an idempotency key; retries do not duplicate rows.

Authenticated admin, analyst, and viewer users can read `GET /api/security-events` with severity, source, review-status, and pagination filters. Admin and analyst users can review an event using `POST /api/security-events/:id/review`. Reviews are recorded with the user identity and a timestamp.

Ingestion only stores the normalized event for review. It does not verify the upstream product's detection, create an incident or alert automatically, run a scan, or execute containment. A provider-specific connector or SIEM/EDR configuration must still be built and configured; no external source is connected by default.

The schema is in `database/init/006_security_event_ingestion.sql`. Docker applies it automatically only when creating a new database. For an existing database, back it up and apply the migration once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/init/006_security_event_ingestion.sql
```

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
