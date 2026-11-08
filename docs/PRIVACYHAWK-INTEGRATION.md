# PrivacyHawk Partner API Integration

**Implementation branch:** feat/privacyhawk-provider-integration  
**Status:** code integration in progress; live provider authentication is not verified until partner credentials are configured and a sandbox request succeeds.

## Scope in this implementation slice

- Server-side OAuth 2.0 client-credentials adapter; secrets and bearer tokens stay in the Express API process. The published partner specification documents the token endpoint at https://privacyapi.privacyhawk.com/token; resource requests use the selected sandbox or production API host.
- Explicit per-scan consent before sending a profile to PrivacyHawk.
- Authenticated, subject-scoped scan creation, scan history, status refresh, broker catalog and record retrieval.
- Provider records are allow-listed before returning to the browser; relatives and unrelated fields are not returned.
- Profile fields are not persisted in NEXUS tables. Only consent metadata, provider scan identifiers, status and append-only audit events are stored.
- Provider status is described as credentials_configured, not as a verified live connection.
- Sandbox is the default environment. Production requires an explicit environment setting.

## Not included / not claimed

- No recurring removal enrollment is created. PrivacyHawk documents that enrollment creation starts recurring scans and data-removal processing; this requires a separate user-facing authorization and release review.
- No broker opt-out or manual-removal action is automatically triggered by a scan.
- No claim is made that the provider supports every country or every broker. The partner API filters results by enabled broker configuration and the profile's primary-address country.
- No live connection is claimed until partner credentials are installed in the API secret manager and a sandbox request is verified.
- No production database migration or deployment is performed by this branch.

## Required server environment

Configure these only in the Express API service secret manager:

- PRIVACYHAWK_ENABLED=true
- PRIVACYHAWK_ENVIRONMENT=sandbox
- PRIVACYHAWK_CLIENT_ID
- PRIVACYHAWK_CLIENT_SECRET

Never commit real credentials or expose them through NEXT_PUBLIC variables. Do not send credentials in chat.

## API behavior

- GET /api/privacy/providers/privacyhawk/status
- POST /api/privacy/providers/privacyhawk/scans
- GET /api/privacy/providers/privacyhawk/scans
- GET /api/privacy/providers/privacyhawk/scans/:scanId
- GET /api/privacy/providers/privacyhawk/scans/:scanId/records
- GET /api/privacy/providers/privacyhawk/brokers

The scan request requires explicit consent and a strict profile schema. The provider-side customer ID is the authenticated NEXUS user UUID. Submitted profile values are sent to PrivacyHawk for the scan and are not stored in the provider scan tables.

Scan rows reference the user with ON DELETE RESTRICT. This prevents account deletion from silently orphaning provider-side records. A verified provider-side deletion/cancellation workflow must exist before changing that guard.

## Verification plan

1. Run API build, unit tests and database migration idempotency in CI.
2. Configure partner sandbox credentials in the API secret manager.
3. Verify OAuth token acquisition and one test scan using synthetic identity data.
4. Verify callback signatures, country-specific broker availability and retention with PrivacyHawk before enabling production.
5. Implement recurring enrollment/removal as a separately consented phase with explicit confirmation gates and end-to-end tests.
