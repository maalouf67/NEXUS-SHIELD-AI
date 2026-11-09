# NEXUS SHIELD AI — OCSF Event Normalization Foundation

## Status

This change introduces a tested, provider-neutral OCSF projection helper. It does not change the security-event ingestion API, persistence schema, dashboards, exporters, or production configuration.

## Pinned schema

The normalizer targets **OCSF 1.9.0**, the stable schema release pinned for this integration. The upstream main branch may contain unreleased schema work; do not silently follow it in production.

Official schema source: https://github.com/ocsf/ocsf-schema/tree/1.9.0

## Why the Base Event is used first

NEXUS currently accepts a provider-neutral security-event contract with a free-form eventType. That field alone does not prove the event is an authentication attempt, network flow, process execution, or a confirmed detection.

The mapper therefore emits the OCSF **Base Event** (class_uid=0, category_uid=0, activity_id=0, type_uid=0) until a source adapter can establish a specific event class from documented source semantics. It deliberately does not guess an Authentication or Detection Finding class from names such as auth.login.failed.

## Field mapping

| NEXUS field | OCSF 1.9.0 field | Handling |
| --- | --- | --- |
| observedAt | time | RFC 3339 with explicit timezone, converted to UTC epoch milliseconds |
| severity | severity, severity_id | Explicit mapping: informational=1, low=2, medium=3, high=4, critical=5 |
| summary | message | Control characters removed and whitespace collapsed |
| source | metadata.source | Validated bounded source identifier |
| externalEventId | metadata.original_event_uid | Preserved for source traceability |
| eventType | unmapped.nexus_event_type | Preserved as NEXUS-specific data until a verified OCSF class mapping exists |
| assetId | unmapped.nexus_asset_id | Preserved only when supplied and valid |
| attributes | — | Not copied: arbitrary provider attributes may contain PII, credentials, or unreviewed values |

The required metadata.product and metadata.version identify the NEXUS producer and pinned OCSF schema version.

## Security and compatibility boundaries

- The helper is pure and does not make network calls or write to PostgreSQL.
- It does not add a migration or mutate any historical migration.
- It does not change the current event-ingestion contract or API response.
- It does not export request paths, IP addresses, cookies, tokens, phone numbers, email addresses, or arbitrary provider attributes.
- Event summaries remain source-provided content; review and apply the platform's data-retention and export controls before forwarding them outside the workspace.
- Workspace IDs are not embedded in the normalized event by this initial helper. Any future storage/export integration must preserve workspace scoping and authorization.

## Next integration stages

1. Add source-specific adapters only when event fields and source semantics are verified (for example, Authentication, Network Activity, or Detection Finding).
2. Add OCSF schema validation in CI against the pinned 1.9.0 schema.
3. Integrate the projection into the trusted-event ingestion pipeline without changing its existing API compatibility.
4. Store or export normalized records only after a workspace-scoped persistence design and retention policy are reviewed.
5. Expand OpenTelemetry separately: the existing HTTP tracing middleware is manual OTLP export, not SDK-based auto-instrumentation. Add DB/provider instrumentation, sampling, and secured collector authentication only with dedicated tests and configuration review.

## Validation

The companion unit tests cover the generic-class policy, severity mapping, timestamp conversion, input validation, and exclusion of arbitrary provider attributes. CI remains the authoritative build/type-check/test gate for this branch.
