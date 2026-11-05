# NEXUS SHIELD AI

NEXUS SHIELD AI is an actively developed cyber-defense platform foundation combining a web console, API services, evidence-aware graph analysis, and AI-assisted security analysis.

## Current implementation status

- The Attack Path Intelligence engine performs bounded, deterministic, read-only graph traversal over asset relationships supplied by a caller.
- The API exposes that engine through a service-token-protected endpoint. It does not scan devices, discover assets, execute security actions, or prove exploitability.
- The cost-incurring AI threat-analysis endpoint also requires the same server-side service token; the dashboard does not trigger AI requests automatically.
- Dashboard incident, critical and mitigated totals are aggregated from PostgreSQL incident records. No calibrated AI score or live upstream threat telemetry is available by default; security-event records appear only when a trusted source submits them.
- AI threat analysis evaluates information explicitly supplied to the API. It is not a system scan or incident confirmation.
- API bearer authentication and admin/analyst/viewer role checks are implemented. The web dashboard includes an initial authenticated flow, team management, and incident/alert/event review. A normalized event ingestion endpoint is ready for trusted upstream sources, but provider-specific connectors, live source configuration, and automated response are not yet in place.
- A PostgreSQL-backed asset inventory API now supports authenticated, transactional upserts and read-only analysis of stored relationships.

Do not describe sample data or planned capabilities as active protection.

## Architecture

- Frontend: Next.js web/admin console
- API: Node.js, TypeScript, Express, and Zod
- AI threat-analysis layer: TypeScript AI SDK orchestrator/provider inside the Express API; OpenAI access uses the server-side `OPENAI_API_KEY`
- Malware scanning service: Python + FastAPI, authenticated service-to-service requests, private quarantine and ClamAV integration
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
6. The optional `NEXUS_SERVICE_API_TOKEN` must be at least 32 characters. Configure it only in trusted server environments that require it (API, Next.js server, and AI service scanner). Never expose it through browser-visible configuration.
7. Set `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local` to the API URL reachable by the browser.

Never commit populated `.env`, `.env.local`, API keys, passwords, or service tokens.

## Local PostgreSQL

Start the local database only after setting a strong `POSTGRES_PASSWORD` in the root `.env`:

```bash
docker compose up -d postgres
```

PostgreSQL and Adminer bind to `127.0.0.1` only. Adminer is available locally at `http://127.0.0.1:8080`.

After PostgreSQL starts, apply the numbered schema and verify the API's database connection:

```bash
npm run db:migrate
npm run db:check
```

The migration runner applies numbered files 001–008, uses a PostgreSQL advisory lock, records SHA-256 checksums, and refuses modified historical migrations. It is safe to re-run against a database whose schema is already present, provided the schema matches the repository migration files. Back up an existing or production database and inspect pending SQL before migration. See [Database migrations and connectivity](docs/DATABASE-MIGRATIONS.md).

The API database pool supports explicit local non-TLS mode and verified TLS mode. Supabase hosts use the bundled Supabase CA by default; other providers use Node's trusted system roots unless DATABASE_SSL_CA_PATH explicitly supplies a provider CA. Certificate verification remains enabled.

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

## Malware file scanning and owner-scoped history

The web console includes a protected `/scan` page for Admin and Analyst users. The native Android companion is in `apps/android`; it signs in to the API, scans one user-selected file through the protected web gateway, and displays that user's scan history. It does not request broad Android storage access.

The web gateway verifies a short-lived API session/JWT, enforces same-origin checks for cookie-authenticated browsers, accepts bearer authentication for native clients, restricts scan submissions to Admin/Analyst roles, and applies an initial per-process limit of five scan requests per account every 15 minutes. The AI service receives an owner UUID from the authenticated gateway and stores each account's files in a separate private quarantine subdirectory.

The Python AI service:

- Accepts exactly one multipart file and enforces a configurable maximum of 100 MiB.
- Ignores the supplied file name and MIME type. It streams bytes into a private owner-scoped quarantine directory using a generated SHA-256 identifier.
- Uses restrictive directory/file permissions (0700/0600), checks symlinks and content hashes, and never executes an uploaded file.
- Uses ClamAV `clamdscan` with a 60-second process timeout. Scanner failures/timeouts are never converted into a clean verdict.
- Keeps a sample quarantined if ClamAV cannot return a verdict; a retry can only reference a sample owned by the authenticated account.

## Scan history and retention

Migration `database/init/007_malware_scan_history.sql` adds owner-scoped sample metadata and scan-run history. Each user can retrieve only their own records. Stored audit data includes the SHA-256 identifier, byte size, verdict, scanner, timestamps and error code—not the original file name or file contents.

The API retention scheduler attempts cleanup at startup and every six hours:
- Quarantined sample files are scheduled for deletion after 7 days.
- Scan-history metadata is scheduled for deletion after 30 days.
- If the AI service or private quarantine cannot be reached, cleanup fails closed and retries later. It does not mark a file deleted when the storage deletion call fails.

These are configured source-code policies. Their behavior must still be observed in the target runtime before production use.

## Local development — Docker and a real ClamAV test

ClamAV's TCP socket is reachable only over the private Docker Compose network; port 3310 is not published to the host. The AI HTTP service binds to host loopback at `127.0.0.1:8001`. The quarantine volume and ClamAV signature database use separate persistent Docker volumes. The Compose ClamAV container is assigned 4 GiB memory, aligned with ClamAV's documented preferred memory budget for signature loading and reloads.

1. Configure strong, unique values for `POSTGRES_PASSWORD`, `JWT_SECRET`, `SESSION_SECRET`, and `NEXUS_SERVICE_API_TOKEN` in the root `.env`. The service token must be at least 32 characters.
2. Copy the required values into `services/api/.env` and `apps/web/.env.local`. Set `API_BASE_URL=http://127.0.0.1:4000` and `AI_BASE_URL=http://127.0.0.1:8001` in the web server environment; set `AI_BASE_URL` and the same service token in the API environment.
3. Start the local database, ClamAV, and AI scanner:

   ```bash
   docker compose up -d postgres clamav ai
   ```

4. Start the web console and Node API separately (do not start a second Python AI process):

   ```bash
   npm run dev:web-api
   ```

5. Sign in as an Admin or Analyst and open `/scan`. Use only benign files while developing. A signature-clean result is not a guarantee that a file is harmless.

The CI workflow builds the Docker images, waits for the real ClamAV daemon to become healthy, submits a benign fixture and the harmless EICAR antivirus test string, and verifies the expected `clean` and `detected` results. This runtime test is separate from Python unit tests, which mock scanner responses.

**Important:** the Android module is an on-demand file-scanning companion, not a full-device antivirus. Continuous VPN/network filtering, an endpoint agent, iOS support, asynchronous scan queues, file-release workflows and automated response are not active. The Android debug APK is a development artifact only.

## Application Trust Center

The dashboard links to /settings, /help, /contact, /license, and /privacy. Settings currently saves language preference (English, Arabic, French) and optional privacy preference toggles in browser storage only. Full dashboard localization and server-side preference synchronization are not yet implemented.

The Application License and Privacy Policy pages are marked as drafts. The project owner must choose/finalize the repository and application license, verify the legal rights holder, configure a monitored support/privacy contact, and obtain qualified legal review (including applicable Moroccan requirements) before production publication. The contact page deliberately does not invent an email address.

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

The browser calls the same-origin `/api/nexus/*` proxy. The proxy forwards only allow-listed incidents, alerts, and threat-summary requests with the session bearer token. It applies an Origin check to state-changing requests and never accepts an arbitrary upstream URL from the browser. The manual `POST /api/ai/threat-analysis` route first verifies the session and admin/analyst role, then calls the protected API with a server-only `NEXUS_SERVICE_API_TOKEN`. Configure the same strong service token in both the API and trusted Next.js server environments. The AI endpoint applies a limit of 10 requests per user per 15 minutes. The OpenAI key remains on the API server only.

For local development, create `apps/web/.env.local` and set:

```env
NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:4000"
```

The BFF reads this value server-side as a fallback when `API_BASE_URL` is not set. The API's CORS allow-list is empty by default because browser requests use the same-origin BFF; leave `ALLOWED_ORIGINS` empty unless a separately authorized browser origin must call the API directly. For hosted environments, prefer a server-only `API_BASE_URL` value and keep secrets out of `NEXT_PUBLIC_*` variables. The JWT cookie expires after 15 minutes; sign-out clears the browser cookie. Because the API uses short-lived stateless access tokens, a signed-out token may remain cryptographically valid until its expiry, but the browser no longer retains it.

## Manual AI threat analysis

The web dashboard provides an explicit analyst-submitted AI analysis form. It sends only the target label, source label, optional signal type, and analyst-provided details. It does not scan a device, collect telemetry, or persist the request. Admin and analyst roles can use it; viewers cannot.

The Next.js server verifies the user's JWT against `/api/auth/me` before forwarding the request to the protected API. The API applies a limit of 10 AI requests per authenticated user per 15 minutes. The endpoint returns a structured classification, model-assigned score, findings, recommendations, explanation, and a disclaimer. These outputs are model-generated assessments of the supplied information, not proof of a security incident.

Configure `OPENAI_API_KEY` only in the API server environment. Configure the same `NEXUS_SERVICE_API_TOKEN` in the API and trusted Next.js server environments. Neither credential belongs in browser-visible `NEXT_PUBLIC_*` variables. The dashboard does not call the AI endpoint on page load.

## Human user authentication and roles

The API provides short-lived JWT bearer access tokens:

- `POST /api/auth/login` — accepts an email and password, then issues a 15-minute access token.
- `GET /api/auth/me` — returns the identity and role encoded in a valid token.
- `GET /api/users` — admin-only user directory.
- `POST /api/users` — admin-only creation of analyst or viewer accounts. Public self-registration and HTTP promotion to admin are deliberately disabled.

Every new user password is hashed with bcrypt before storage. Failed login responses do not reveal whether an email address exists. Login attempts are rate-limited. Tokens are signed with `JWT_SECRET` and restricted to the HS256 algorithm, issuer, audience, and expiry.

### Apply the user authentication migration

The schema is in `database/init/003_user_auth.sql`. Docker applies it automatically only when it initializes a new database. After backing up an existing database, use the ordered migration runner:

```bash
npm run db:migrate
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

The inventory schema is defined in `database/init/002_attack_path_inventory.sql`. It is included in Docker's initialization directory for new databases. After backing up an existing database, use the ordered migration runner:

```bash
npm run db:migrate
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

The schema is in `database/init/004_incident_management.sql`. Docker applies it automatically only when creating a new database. After backing up an existing database, use the ordered migration runner:

```bash
npm run db:migrate
```

## Alert review API

The authenticated alert API provides:

- `GET /api/alerts` — list alerts with status, minimum risk score, and bounded pagination filters. Viewers can read.
- `POST /api/incidents/:id/alerts` — admin and analyst roles can record an alert from information they submit. The request includes a type and an integer risk score from 0–100.
- `PATCH /api/alerts/:id/status` — admin and analyst roles can acknowledge or resolve alerts through allowed transitions. Reopening a resolved alert is admin-only.

Alert creation and status changes are recorded in the linked incident audit history within the same database transaction. These endpoints record analyst-supplied information; they do not collect telemetry, verify a threat, run a scan, or perform containment.

The alert-to-audit link is added by `database/init/005_alert_audit_link.sql`. After backing up an existing database, use the ordered migration runner:

```bash
npm run db:migrate
```

## Normalized security event ingestion

Trusted upstream security tools can send normalized events to:

`POST /api/integrations/security-events`

The route requires the dedicated `NEXUS_EVENT_INGESTION_TOKEN` in the `X-NEXUS-INGESTION-TOKEN` header. This secret is separate from the service token and user JWT signing secret. Keep it on the API server and trusted connector only. If it is absent or shorter than 32 characters, ingestion fails closed with `503`.

The request contains an `events` array of 1–100 normalized records. Each record includes a source identifier, source event ID, event type, severity, observed timestamp, summary, optional asset ID, and at most 20 string attributes. Batch size is bounded by the API's 1 MB JSON body limit. Source and external event ID form an idempotency key; retries do not duplicate rows.

Authenticated admin, analyst, and viewer users can read `GET /api/security-events` with severity, source, review-status, and pagination filters. Admin and analyst users can review an event using `POST /api/security-events/:id/review`. Reviews are recorded with the user identity and a timestamp.

Ingestion only stores the normalized event for review. It does not verify the upstream product's detection, create an incident or alert automatically, run a scan, or execute containment. A provider-specific connector or SIEM/EDR configuration must still be built and configured; no external source is connected by default.

The schema is in `database/init/006_security_event_ingestion.sql`. Docker applies it automatically only when creating a new database. After backing up an existing database, use the ordered migration runner:

```bash
npm run db:migrate
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
