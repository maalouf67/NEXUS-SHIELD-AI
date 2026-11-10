# PostgreSQL connectivity and schema migrations

## Connection configuration

The Express API creates one shared PostgreSQL pool from DATABASE_URL. TLS certificate verification is enabled by default.

- Local Docker Compose: set DATABASE_SSL=false only for the local loopback PostgreSQL service.
- Supabase: the bundled Supabase root CA is selected only for Supabase database and pooler hostnames when no custom CA path is configured.
- Other managed PostgreSQL providers: Node.js system trust roots are used by default. Set DATABASE_SSL_CA_PATH to a provider-issued CA file when the provider requires a private CA.
- Never disable TLS certificate verification in production.
- Keep DATABASE_URL server-side. URL-encode reserved characters in credentials and do not put the connection string in browser-visible variables.

## Check connectivity

From the repository root, after dependencies are installed and the API environment contains a valid DATABASE_URL:

```bash
npm run db:check
```

The command performs SELECT NOW(), reports only the successful timestamp, and does not print the connection string or database password. A successful check proves this process can execute a query on the configured database; it does not validate backups, restore procedures, failover, production access policies or application data correctness.

The authenticated API readiness route GET /api/health/ready performs a database query. Provider fields in that response mean only that credentials are present; they do not prove that an external provider is reachable.

## Apply schema migrations

From the repository root:

```bash
npm run db:migrate
```

The command reads numbered SQL files in database/init in filename order, acquires a PostgreSQL advisory lock, creates nexus_schema_migrations when needed, computes SHA-256 checksums, applies each missing migration in its own transaction and records the checksum only after the SQL commits. It skips a migration only when the recorded checksum matches the current file. If a previously applied file changes, it stops; create a new numbered migration instead.

Current numbered migrations: 001 through 013. Migration 012 adds the threat-intelligence analytics foundation; migration 013 adds the NEXUS agent-platform run and outbox tables with forced tenant RLS. Migration 009 adds server-side access-session records and revokes active sessions when a user's global role, active state, or password hash changes. Migration 010 adds the privacy request lifecycle. Migration 011 adds workspace identities, active memberships, per-workspace integration credentials, nullable ownership columns for SOC and asset inventory records, and composite foreign keys that prevent newly scoped child records from linking across workspaces.

Legacy data policy: rows created before workspace ownership existed remain unassigned (workspace_id IS NULL). Customer workspace APIs must not expose them, and no owner may be inferred from the first login or record creator. Any backfill requires a reviewed ownership report, an explicit owner mapping, a dry run, row-count and relationship validation, and a separately approved change window.

CI uses this same command against a disposable PostgreSQL 16 service, verifies migration idempotency and required tables, and runs database integration tests. CI never targets production.

## Existing Docker volumes and production databases

Docker /docker-entrypoint-initdb.d scripts run only when PostgreSQL initializes an empty data directory. They are not replayed automatically when an existing volume is mounted.

For an existing database, the runner can apply missing idempotent SQL files and record them. Before running against production:

1. Confirm DATABASE_URL points to the intended database.
2. Take and verify a restorable database backup.
3. Review pending numbered SQL files and required privileges.
4. Schedule an appropriate maintenance window.
5. Run npm run db:check, then npm run db:migrate.
6. Re-run connectivity and application integration checks.

Do not point CI or a local development terminal at production. Do not run migrations against a production URL until an explicit release procedure, backup and rollback plan have been approved. The migration command does not automatically connect to a cloud database or create a server.

## Migration authoring rules

- Never edit a numbered migration after it has been applied in an environment.
- Add a new sequential file such as 014_add_example_index.sql for future changes.
- Prefer idempotent DDL where practical, but do not use IF NOT EXISTS to conceal incompatible schema drift.
- Keep data backfills bounded and separately reviewed.
- Avoid long table locks on high-volume tables; use an online migration strategy where required.
- The current runner wraps each file in a transaction. Do not add statements that PostgreSQL forbids inside a transaction block without first extending the runner with an explicit, reviewed non-transactional mode.
- Keep user data, credentials and database URLs out of migration files and CI logs.