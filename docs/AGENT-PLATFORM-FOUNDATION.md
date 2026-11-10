# NEXUS Agent Platform — Foundation Spike

## Scope

This additive foundation introduces one executable agent, the Temporal workflow/worker boundary, NATS JetStream event publication, a PostgreSQL transactional outbox, and tenant-scoped persistence. It does not replace the existing Express API, Next.js application, or FastAPI malware-scanning service. It does not enable autonomous defensive actions.

## First agent

`nexus.security-triage.v1` classifies analyst- or trusted-source-submitted security event text using explicit, versioned indicators. The output includes classification, score, matched evidence, recommendations, and `read_only=true`. It does not scan hosts, validate exploitability, call external threat feeds, or block traffic. This first vertical slice is deterministic rather than an LLM-backed reasoning agent; a model adapter is a later, separately governed addition.

## Runtime flow

1. An analyst/admin calls the Express endpoint `POST /api/agents/security-triage` with a valid bearer session and `X-NEXUS-WORKSPACE-ID`.
2. The existing API middleware verifies the signed token and active server-side session, then validates that the user is an active member of the selected workspace with the `admin` or `analyst` workspace role. The body schema is strict; clients cannot provide `tenant_id` or `task_id`. A dedicated 10 requests / 15 minutes limiter keys by validated workspace and authenticated user.
3. Express derives `tenant_id` from the validated `workspaceContext.id`, generates a new task ID server-side, and submits the payload to the private FastAPI agent gateway using the server-only `NEXUS_AGENT_PLATFORM_TOKEN`.
4. The gateway verifies the bearer token with a constant-time comparison, validates the payload, and starts `NexusSecurityTriageWorkflow` in Temporal. Its health endpoint is the only unauthenticated route; API documentation/OpenAPI endpoints are disabled.
5. Temporal schedules `execute_security_triage` and retries bounded failures. The activity validates and analyzes the submitted event.
6. In one PostgreSQL transaction, the worker sets the transaction-local `nexus.tenant_id`, inserts the result and a transactional outbox row.
7. A second activity publishes the outbox payload to NATS JetStream using a tenant-scoped subject (`nexus.agent.events.<tenant-uuid>`) and deterministic `Nats-Msg-Id` for deduplication, then marks it delivered. Configure NATS account/subject permissions so each tenant consumer can only subscribe to its own subject.
8. The workflow reads the persisted result under the same tenant context and returns it through the gateway and authenticated API response.

The outbox closes the database-to-broker dual-write gap. A crash after publish but before marking delivery can cause a retry; JetStream message de-duplication reduces duplicates within its configured duplicate window. Consumers must still be idempotent.

## Database and tenant isolation

Migration `013_agent_platform_foundation.sql` is additive. Both tables use forced PostgreSQL RLS and policies bound to `current_setting('nexus.tenant_id', true)`. The application role must be a non-superuser, must not have `BYPASSRLS`, and must not own these tables. Use a dedicated runtime role with only required SELECT/INSERT/UPDATE privileges; use a separate migration owner to apply DDL. Missing tenant context returns no rows and rejects writes. Never use a pooled connection outside the transaction after setting tenant context.

Before production, validate that the target PostgreSQL version provides `gen_random_uuid()` (or adapt through a reviewed migration), grant least-privilege table/sequence access, and run cross-tenant negative tests with the exact production runtime role. Existing workspace records are not modified and no existing tables are altered.

## Local prerequisites and smoke test

- Docker Compose and the existing repository PostgreSQL service.
- Python 3.12+ and pip.
- A local disposable database; do not point this spike at production.

Start the existing PostgreSQL plus the local Temporal/NATS overlay. Set a unique random `NEXUS_AGENT_PLATFORM_TOKEN` (at least 32 characters) in the local `.env`; use the exact same value only in the trusted API process and the gateway container. Set `AGENT_PLATFORM_URL=http://127.0.0.1:8090` for an API process running directly on the host:

```bash
docker compose -f docker-compose.yml -f infra/agent-platform/docker-compose.agent-platform.yml up -d postgres temporal nats
```

The gateway listens on host loopback only in this local overlay. Do not publish it on a public interface. For hosted environments, put API and gateway on a private network, use HTTPS or authenticated service-mesh transport, and inject the shared token from the secret manager.

The current repository migration runner discovers every numbered SQL file matching `NNN_name.sql` in `database/init`, so migration 013 is included automatically. Back up the disposable local database and review the SQL before running `npm run db:migrate`. Never point this command at production without a separately approved migration window and verified backup.

Install the isolated package:

```bash
python -m venv .venv-agent
. .venv-agent/bin/activate
pip install -e "services/agent-platform[test]"
```

Provision a dedicated PostgreSQL runtime login that is not a superuser, does not have `BYPASSRLS`, and does not own the new tables. Grant only CONNECT, schema USAGE, and SELECT/INSERT/UPDATE on the two agent tables. Set `AGENT_DATABASE_URL` to that role's local connection string. The overlay starts the worker and gateway as restricted containers. The API gateway receives no PostgreSQL or NATS credentials; only the worker receives the dedicated PostgreSQL runtime connection.

```bash
docker compose -f docker-compose.yml -f infra/agent-platform/docker-compose.agent-platform.yml up -d postgres temporal nats agent-worker
```

The normal application path is the Express endpoint, not a public Temporal endpoint. The caller must present an active API access token and a workspace membership header. Example request (replace placeholders with local test credentials and a workspace the user belongs to):

```bash
curl --fail-with-body -X POST http://127.0.0.1:4000/api/agents/security-triage \\
  -H "Authorization: Bearer $NEXUS_ACCESS_TOKEN" \\
  -H "X-NEXUS-WORKSPACE-ID: $NEXUS_WORKSPACE_ID" \\
  -H "Content-Type: application/json" \\
  -d '{"event_type":"security.alert","source":"test-sensor","target":"test-asset","details":"Possible data exfiltration detected"}'
```

A local-only CLI remains available for isolated development, but bypasses the Express authentication/workspace gateway and must never be exposed as an application-facing path. It requires `TEMPORAL_ADDRESS=localhost:7233` and should only be used with disposable test tenants. Example:

```bash
PYTHONPATH=services/agent-platform/src python -m nexus_agents.submit \
  --tenant-id 11111111-1111-4111-8111-111111111111 \
  --task-id triage-test-0001 --event-type security.alert \
  --source test-sensor --target test-asset \
  --details "Possible data exfiltration detected" \
  --observed-at 2026-11-10T12:00:00Z
```

Expected result: `critical` classification, score 95, evidence referencing the supplied indicator, and read-only recommendations. Verify one row in `nexus_agent_runs`, one delivered outbox row, and one event in the NATS stream. This expected output is a test specification, not a claim that the runtime test has already passed.

## Production hardening gates

- Replace Temporal dev server with a supported production Temporal deployment and durable persistence/visibility backend.
- Configure NATS authentication, TLS, account/subject permissions, JetStream replication, retention and backup.
- Use TLS and secret-manager-managed credentials for all service connections.
- [x] Add an Express workspace-scoped submission route that derives tenant identity from verified active membership; reject client-supplied tenant/task identifiers.
- [x] Add a private FastAPI-to-Temporal gateway with a 32+ character shared bearer secret and constant-time token comparison; disable public API documentation.
- [x] Add gateway and API authorization tests; the CI smoke path exercises the gateway over HTTP through Temporal, PostgreSQL/RLS and NATS.
- [ ] Configure hosted API/gateway private networking, TLS/service-mesh transport and secret-manager rotation. The repository overlay is local-only and must not be treated as a production deployment.
- [ ] Configure NATS account/subject ACLs so tenant consumers cannot subscribe across tenant subjects; subject naming by itself is not an authorization boundary.
- Configure a separate migration role and least-privilege runtime DB role; test RLS with non-owner credentials.
- Add integration tests for retry, worker restart, duplicate delivery, tenant isolation, malformed input, and database/broker outage.
- Add rate limits, per-tenant quotas, cost budgets, trace correlation, metrics and alerting before increasing concurrency.
- The local overlay binds ports to loopback and is not a production deployment recipe.
