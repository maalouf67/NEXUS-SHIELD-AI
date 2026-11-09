# NEXUS SHIELD AI — OCSF & Security Telemetry Pipeline

## Scope

This phase integrates the pinned OCSF 1.9.0 mapper into workspace integration ingestion, persists a versioned normalized projection in the same PostgreSQL transaction as the source event, returns the projection through the authenticated workspace-scoped event list, and adds low-cardinality OpenTelemetry spans for normalization, persistence, and the AbuseIPDB feed request.

## Event classification policy

The ingestion contract accepts a provider-neutral, free-form eventType. That alone does not prove a specific OCSF class. Until a source adapter verifies the underlying source semantics, NEXUS emits OCSF Base Event (class_uid=0, category_uid=0, activity_id=0, type_uid=0). It does not infer Authentication, Network Activity, or Detection Finding from a string label.

## Persistence and tenant isolation

- Migration 014 creates security_event_ocsf_records.
- Each projection is keyed by workspace, source event ID, and schema version.
- A composite foreign key binds the projection to the same workspace as its source event.
- Source event and OCSF projection are committed or rolled back in one transaction.
- Replayed source events do not create duplicate projections.
- Existing historical events are not backfilled by this migration. They have ocsfEvent=null until newly ingested; a separately reviewed backfill can be added later.
- Global NULL-workspace system events are not copied into the tenant projection table.

The projection does not copy arbitrary provider attributes. It contains the bounded normalized summary, source identifier, external event ID, event type in unmapped, optional asset identifier, timestamp, severity, and producer metadata. The normalized JSON is SHA-256 fingerprinted.

## API compatibility

- The trusted ingestion request contract remains unchanged.
- The existing 202 response remains unchanged except for the additive ocsf_schema_version field.
- Authenticated GET /api/security-events adds ocsfEvent to each event. It is null for legacy records without a projection.
- All projection reads are joined using the active workspace ID and event ID.

## OpenTelemetry

The existing middleware remains opt-in and exports OTLP/HTTP JSON only to HTTPS endpoints or loopback HTTP collectors. This phase adds manual child spans for:
- OCSF normalization (event count and schema version only).
- Workspace-scoped PostgreSQL event ingestion (database system, operation, count only).
- AbuseIPDB blacklist fetch (fixed provider hostname and method only).

It does not install the OpenTelemetry Node SDK or auto-instrument every library. It does not export request bodies, source event attributes, event summaries, IPs, phone numbers, email addresses, cookies, authorization headers, API keys, or SQL parameters. Collector failure remains best-effort and must not change the application response.

## Validation

The PostgreSQL integration suite verifies that identical upstream identifiers in two workspaces create separate events and separate OCSF projections, while the authenticated list returns only the projection for its active workspace. Unit tests verify OCSF mapping, privacy minimization, and parent/child OTLP span relationships.
