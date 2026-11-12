# NEXUS SHIELD AI — Threat Intelligence Feed Engine

## Scope

The first feed adapter retrieves the AbuseIPDB API v2 blacklist using the server-side
`ABUSEIPDB_API_KEY`. The key is never sent to a browser, stored in PostgreSQL, or
included in logs. The provider request uses HTTPS, a fixed official hostname, a bounded
result limit, and a request timeout.

## Configuration

- `ABUSEIPDB_API_KEY`: required on the API server. If absent, sync returns
  `NOT_CONFIGURED` and makes no external request.
- `ABUSEIPDB_FEED_CONFIDENCE_MINIMUM`: integer 25–100; defaults to 90.
- `ABUSEIPDB_FEED_MAX_ITEMS`: integer 1–10000; defaults to 10000.
- `ABUSEIPDB_FEED_MAX_AGE_HOURS`: accepted provider snapshot age 1–168 hours;
  defaults to 6 hours.
- `ABUSEIPDB_DAILY_LIMIT`: shared provider request budget with the existing IP
  reputation check route.

The provider response must contain a valid `meta.generatedAt` (or the documented
`X-Generated-At` header). Snapshots too old or more than five minutes in the future
are rejected before opening a database transaction. Only globally routable public IPs
and entries meeting the configured confidence floor are accepted.

## Data handling

- Feed records, runs, indicators, matches, correlations and warnings are workspace-scoped.
- Indicator values are stored as SHA-256 fingerprints, consistent with the existing
  threat-indicator schema; raw IP values are used only transiently for event matching.
- Duplicate indicators are collapsed in memory and upserted by the existing
  workspace/type/fingerprint/source uniqueness constraint.
- Event matching is restricted to the active workspace, the last seven days, and a
  fixed allowlist of IP attribute keys.
- A match creates an evidence record, a correlation edge and a deduplicated early
  warning. Warnings request analyst review; they do not block, quarantine or otherwise
  change traffic.
- Repeated syncs do not create duplicate matches or warnings for the same indicator/event.

## API

- `GET /api/threat-intelligence/feeds`: workspace-scoped feed status.
- `POST /api/threat-intelligence/feeds/abuseipdb/sync`: analyst/admin-triggered
  synchronization; viewer access is denied.

The feed is not active until a valid server-side API key is configured and a successful
sync is observed. No provider connection or live data is assumed from the presence of
code alone.
