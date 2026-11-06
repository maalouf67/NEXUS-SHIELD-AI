# Railway deployment readiness — Active Defense & IPS

**Status: deployment checklist; no live Railway configuration is verified by this document.**
**Applies to:** the NEXUS API service and, only when using the custom image, the NEXUS PostgreSQL service.

This checklist separates CI evidence from settings that must be checked in the actual Railway project. A green GitHub workflow is not proof that Railway variables, volumes, networking, or production data are configured correctly.

## 1. API service network binding

The API now defaults to `HOST=0.0.0.0` when `NODE_ENV=production`, while retaining `127.0.0.1` for local development. An explicit `HOST` variable overrides this default. For Railway, set the API service variable explicitly so the deployment intent is visible:

```text
HOST=0.0.0.0
```

Keep Railway's injected `PORT`; do not hard-code a production port. After deployment, confirm the startup log reports the expected host and port and that the Railway health check reaches the service.

## 2. Custom PostgreSQL image and Railway volume permissions

Railway documents that attached volumes are mounted as root. For an image that declares a non-root `USER`, Railway documents this service variable:

```text
RAILWAY_RUN_UID=0
```

Set it **only on the service using `database/Dockerfile.railway`** when that custom image is used with a Railway volume at `/var/lib/postgresql/data`.

The intended startup sequence is:
1. Railway starts the container entrypoint with UID 0 so the official PostgreSQL entrypoint can prepare the root-owned data directory.
2. The entrypoint uses the image's `gosu` binary to drop privileges.
3. The PostgreSQL server process runs as the `postgres` user, not root.

The CI security workflow tests a root-owned Docker volume by starting the container with `--user 0`, waits for PostgreSQL readiness, and asserts that PID 1 runs as the image's `postgres` UID. This is a local container compatibility test, not a live Railway deployment test.

Do not set `RAILWAY_RUN_UID=0` on unrelated application services. Do not delete, recreate, or reformat an existing database volume as a troubleshooting shortcut.

Railway reference: https://docs.railway.com/volumes

## 3. Reverse-proxy client IP handling

The API defaults `TRUST_PROXY_HOPS=0`. The login limiter and anomaly containment depend on Express's resolved `request.ip`; an incorrect proxy-hop value can collapse many clients into one apparent source or allow spoofed forwarded addresses.

Before enabling IP-based containment in production:
- Determine the actual trusted proxy chain for the deployed service.
- Set `TRUST_PROXY_HOPS` to the measured number of trusted hops, within the supported range 0–5.
- Test a normal request and a request with a forged `X-Forwarded-For` header from outside the trusted edge.
- Confirm that the application resolves the expected client address without logging or persisting raw IP addresses.
- Do not copy a guessed value such as `1` from this checklist.

If the proxy chain cannot be established, keep automated source containment disabled at the deployment level until the topology is verified; do not claim reliable client attribution.

## 4. API secrets and database connection

Configure these as Railway service variables, not committed files:
- `DATABASE_URL`: private connection reference to the intended PostgreSQL service.
- `DATABASE_SSL=true` unless the selected provider's documented private-network configuration explicitly requires otherwise.
- `JWT_SECRET` and `SESSION_SECRET`: unique, high-entropy values of at least 32 characters.
- `AI_BASE_URL`: the reachable private URL of the NEXUS AI service.
- `NEXUS_SERVICE_API_TOKEN`: the same strong server-side token only in the trusted API, web server and AI service that need it.
- `ALLOWED_ORIGINS`: exact browser origins only when direct cross-origin access is deliberately required.

`RATE_LIMIT_HASH_SECRET` is optional; when omitted, the current code uses `SESSION_SECRET` as the HMAC key. If configured, use a unique value of at least 32 characters. Never print secrets in logs or paste them into source control.

Use the private database hostname where possible. Keep TLS certificate verification enabled; configure `DATABASE_SSL_CA_PATH` only when the provider supplies a CA that Node does not already trust.

## 5. Schema migration and startup order

The API startup preflight requires:
- `api_rate_limit_counters`
- `security_events`
- `security_event_reviews`
- `auth_sessions`

The repository migration runner currently expects nine numbered SQL migrations (001–009), including the server-side `auth_sessions` table and account-security-change revocation trigger. Before any production migration:
1. Confirm the target database identity using a protected operational process.
2. Take a backup and verify that it can be restored.
3. Review the pending numbered migrations.
4. Run `npm run db:check`.
5. Run `npm run db:migrate` once through an approved release procedure.
6. Re-run `npm run db:check` and authenticated readiness checks.

Do not run CI or a developer terminal against the production `DATABASE_URL`. Do not assume Docker init scripts will rerun on an existing volume.

## 5a. Server-side access-session state

The API validates every bearer token against the PostgreSQL `auth_sessions` table. Apply migration 009 before deploying the session-enforcing API. The table is required by the API startup preflight; without it the API will refuse to bind its listener.

The API does not persist raw bearer tokens. Migration 009 records a UUID session identifier, user ID, creation/expiry timestamps and revocation metadata. A database trigger revokes active sessions when a user's role, active state or password hash changes.

Before rollout, expect existing JWTs without a corresponding `jti` row to stop working; coordinate a user sign-in transition. Do not apply migration 009 to production until a restorable backup and approved migration/rollback procedure are in place.

## 6. Health checks and service dependencies

- `GET /health` is liveness only; it proves the HTTP process can answer.
- `GET /api/health/ready` is authenticated readiness and checks PostgreSQL. Provider fields indicate credential presence, not successful external-provider connectivity.
- Verify the API can reach ClamAV at the configured private service hostname and TCP port 3310. A configured hostname alone is not a successful connectivity test.
- Confirm ClamAV becomes healthy within the service's actual memory limit. A failed ClamAV daemon must not be reported as malware scanning available.

## 7. Release go/no-go evidence

Do not declare Active Defense production-ready until all applicable items have evidence from the actual deployment:

- [ ] API binds to `0.0.0.0` and is reachable through the Railway proxy (production code default plus an explicit service variable).
- [ ] PostgreSQL volume survives a restart and the database process runs as the non-root `postgres` user after initialization.
- [ ] `RAILWAY_RUN_UID=0` is present on the custom PostgreSQL service when using its non-root Dockerfile with a Railway volume.
- [ ] `TRUST_PROXY_HOPS` matches the verified proxy topology; forwarded-header spoofing is rejected.
- [ ] The API connects to the intended database with TLS verification enabled.
- [ ] All nine migrations are recorded with matching checksums, including migration 009 for server-side access sessions.
- [ ] Authenticated readiness reports PostgreSQL as available.
- [ ] Two API instances share rate-limit counters and SOC threshold events persist exactly once.
- [ ] ClamAV connectivity and a benign/EICAR test are verified in the deployed environment.
- [ ] False-positive recovery, alerting, backups and restore procedures are documented.
- [ ] TLS, origin access restrictions, edge WAF and DDoS controls are separately configured and tested.

## Evidence already available from CI

On the PR head commit, the Node build/API tests, PostgreSQL migration/idempotency checks, Docker/ClamAV web-gateway integration, Trivy filesystem scan, Trivy image scans, and root-owned-volume PostgreSQL startup test completed successfully. These are CI results only; every unchecked deployment item above remains unverified until tested in the Railway project.
