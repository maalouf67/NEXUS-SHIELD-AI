# NEXUS Agent Platform — Foundation Spike

## Scope

This additive foundation introduces one executable agent, the Temporal workflow/worker boundary, NATS JetStream event publication, a PostgreSQL transactional outbox, and tenant-scoped persistence. It does not replace the existing Express API, Next.js application, or FastAPI malware-scanning service. It does not enable autonomous defensive actions.

## First agent

`nexus.security-triage.v1` classifies analyst- or trusted-source-submitted security event text using explicit, versioned indicators. The output includes classification, score, matched evidence, recommendations, and `read_only=true`. It does not scan hosts, validate exploitability, call external threat feeds, or block traffic. This first vertical slice is deterministic rather than an LLM-backed reasoning agent; a model adapter is a later, separately governed addition.

## Runtime flow

1. A trusted caller starts `NexusSecurityTriageWorkflow` with a tenant UUID and idempotency task ID.
2. Temporal schedules `execute_security_triage` and retries bounded failures.
3. The activity validates and analyzes the submitted event.
4. In one PostgreSQL transaction, the worker sets the transaction-local `nexus.tenant_id`, inserts the result and a transactional outbox row.
5. A second activity publishes the outbox payload to NATS JetStream using a deterministic `Nats-Msg-Id` for deduplication, then marks it delivered.
6. The workflow reads the persisted result under the same tenant context and returns it.

The outbox closes the database-to-broker dual-write gap. A crash after publish but before marking delivery can cause a retry; JetStream message de-duplication reduces duplicates within its configured duplicate window. Consumers must still be idempotent.

## Database and tenant isolation

Migration `012_agent_platform_foundation.sql` is additive. Both tables use forced PostgreSQL RLS and policies bound to `current_setting('nexus.tenant_id', true)`. The application role must be a non-superuser, must not have `BYPASSRLS`, and must not own these tables. Use a dedicated runtime role with only required SELECT/INSERT/UPDATE privileges; use a separate migration owner to apply DDL. Missing tenant context returns no rows and rejects writes. Never use a pooled connection outside the transaction after setting tenant context.

Before production, validate that the target PostgreSQL version provides `gen_random_uuid()` (or adapt through a reviewed migration), grant least-privilege table/sequence access, and run cross-tenant negative tests with the exact production runtime role. Existing workspace records are not modified and no existing tables are altered.

## Local prerequisites and smoke test

- Docker Compose and the existing repository PostgreSQL service.
- Python 3.12+ and pip.
- A local disposable database; do not point this spike at production.

Start the existing PostgreSQL plus the local Temporal/NATS overlay:

```bash
docker compose -f docker-compose.yml -f infra/agent-platform/docker-compose.agent-platform.yml up -d postgres temporal nats
```

Apply migration 012 only after the repository's numbered migration runner has been updated to include it and a local database backup has been taken. The migration runner's current range must be inspected before use; do not assume it automatically discovers 012.

Install the isolated package:

```bash
python -m venv .venv-agent
. .venv-agent/bin/activate
pip install -e "services/agent-platform[test]"
```

Set `DATABASE_URL` to the local PostgreSQL database using the dedicated non-owner runtime role, plus `TEMPORAL_ADDRESS=localhost:7233` and `NATS_URL=nats://localhost:4222`. Start the worker:

```bash
PYTHONPATH=services/agent-platform/src python -m nexus_agents.worker
```

In another terminal, submit a benign test event using `nexus_agents.submit` after adding the package source to `PYTHONPATH`. Example:

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
- Add authenticated workflow submission through the existing API/BFF; do not expose an unauthenticated public submit endpoint.
- Add tenant membership authorization before accepting a tenant ID from any caller.
- Configure a separate migration role and least-privilege runtime DB role; test RLS with non-owner credentials.
- Add integration tests for retry, worker restart, duplicate delivery, tenant isolation, malformed input, and database/broker outage.
- Add rate limits, per-tenant quotas, cost budgets, trace correlation, metrics and alerting before increasing concurrency.
- The local overlay binds ports to loopback and is not a production deployment recipe.
