# Phone reputation scanner

## Architecture

The web page calls the same-origin Next.js server route:

`POST /api/nexus/phone-reputation/check`

The Next.js route forwards the authenticated session to the Express API:

`POST /api/phone-reputation/check`

The Express API requires a valid JWT and the Admin or Analyst role, enforces explicit user consent, and applies shared request quotas before calling provider adapters. Provider credentials remain on the Express API server and are never sent to browser or mobile bundles.

## Providers

### IPQualityScore

The server adapter uses the Phone Number Validation API. Configure `IPQS_API_KEY` on the Express API server only. For numbers beginning with `+212`, the adapter passes `country[]=MA`. `IPQS_PHONE_STRICTNESS` accepts 0, 1, or 2 and defaults to 0.

IPQS documents `spammer=true` as a number recently reported for spam or harassing calls/texts. The application therefore maps it to **suspicious**, not malicious. A fraud score of 75 or higher, `risky=true`, or `recent_abuse=true` also produces a suspicious assessment. Even scores of 90+ are risk indicators and do not independently prove fraud or identify the caller.

### SEON

The server adapter uses the standalone SEON Phone API v2 with a POST request and the `X-API-KEY` header. It sends the international digits without the leading plus sign as the `phone` JSON field. Configure `SEON_API_KEY` on the Express API server only.

Set `SEON_PHONE_API_URL` to the exact endpoint assigned to the SEON account's Transaction Processing Environment. Allowed HTTPS endpoints are:

- Global: `https://api.seon.io/SeonRestService/phone-api/v2`
- Middle East: `https://api.me-central-1-main.seon.io/SeonRestService/phone-api/v2`
- US: `https://api.us-east-1-main.seon.io/SeonRestService/phone-api/v2`
- APAC: `https://api.ap-southeast-1-main.seon.io/SeonRestService/phone-api/v2`

The API rejects non-HTTPS endpoints, unrecognized hostnames, and paths outside the official Phone API endpoint to reduce SSRF risk.

Do not assume that the Middle East endpoint is correct for every account. Confirm the assigned TPE endpoint in the SEON account or with SEON support. SEON documents phone data including carrier, disposable status, online-profile aggregates, consortium fraud history and a phone network risk score. SEON's documentation identifies phone network scores above 80 as risky and suitable for review. The application uses this only as a suspicious signal, not proof of fraud.

### Additional intelligence sources

Malwarebytes offers a consumer Scam Number Check and phone-reputation lookup capability in supported products. That does not by itself establish a public developer API or grant this application permission to call it. Do not scrape the consumer website or use a ChatGPT-only connector as an application backend. Add a Malwarebytes adapter only after an official developer API contract, authentication method, commercial permission, response schema and Morocco (+212) coverage have been verified.

Hiya offers a business phone-reputation API, but its documented service is oriented around registered business numbers and requires a service agreement. It may be evaluated later for business caller-ID reputation, not assumed to be a general consumer-number lookup source.

## Aggregation policy

- An IPQS spammer report is a strong **suspicious** signal, never a confirmed malicious verdict by itself.
- IPQS fraud score >=75, `risky=true`, or `recent_abuse=true` maps to suspicious.
- SEON network score >80, invalid/disposable phone signal, any fraudulent-decline hit, or any fraud-history flag maps to suspicious.
- A provider may return safe only when all required low-risk signals are present and explicit.
- The combined result is safe only when both providers successfully return complete safe assessments.
- Any explicit malicious signal from a future verified source takes priority; otherwise any suspicious signal produces suspicious.
- Provider disagreement is marked as a conflict.
- One provider unavailable means coverage is partial; two unavailable means no coverage. Missing signals and failures never become safe.

These are conservative application rules, not claims that either provider guarantees caller legitimacy or caller identity.

## Request limits and shared storage

The API uses a PostgreSQL-backed custom store for `express-rate-limit`. It shares counters across API processes/replicas, hashes client identifiers before storage, and fails closed if the shared store is unavailable.

Current policies:

- General API: 100 requests per IP per 15 minutes.
- Phone reputation: 5 lookups per authenticated account per 15 minutes.
- Phone reputation: 20 lookups per source IP per 15 minutes.

The phone-specific account and IP limits work together to reduce abuse through account rotation. The shared counter table is defined in `database/init/008_api_rate_limit_counters.sql` and is also created automatically by the API store if it is missing. For production, apply the migration before deployment where possible; otherwise the API database role must be allowed to create this table/index on first startup. Expired counter rows are cleaned up opportunistically.

These application quotas do not replace provider-level commercial quotas. SEON documents different request limits by plan; configure the application limits below the contracted provider allowance and monitor HTTP 429 responses. Provider rate limits are never treated as safe.

## Privacy and operations

- The page requires explicit consent before submitting a number to configured services.
- The Express API never persists the submitted number or raw provider response.
- Responses use `Cache-Control: no-store`.
- Rate-limit keys are SHA-256 hashes; raw account IDs and source IPs are not stored in the counter table.
- Never log phone numbers, provider payloads, API keys, or credential-bearing URLs.
- Keep `IPQS_API_KEY` and `SEON_API_KEY` in the server-side secret manager of the environment hosting the Express API. Do not place them in `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, browser storage, app bundles, or GitHub source files.
- If one provider is not configured, the API reports the provider status and the overall result cannot be safe.
- Automated provider tests use deterministic fixtures; they do not make live billable requests.

## Server connectivity and deployment

This feature requires all of the following connections:

1. Public HTTPS web deployment to the Next.js application.
2. The Next.js server's private/server-only `API_BASE_URL` must point to the reachable Express API origin, for example `https://api.example.com`. Do not use `127.0.0.1` unless the web and API processes share the same network namespace.
3. The Express API must listen on the interface required by its hosting platform. In container/cloud hosting, set `HOST=0.0.0.0` only when the platform requires it; keep local development loopback-only.
4. The Express API host must allow outbound HTTPS to the configured IPQualityScore and SEON API hosts.
5. The API's `DATABASE_URL` must point to the intended PostgreSQL service. Configure TLS and the provider CA as required by that database host.
6. Configure provider keys only in the Express API service's secret/environment settings, then redeploy/restart that service.
7. Configure `API_BASE_URL` in the Next.js server environment and redeploy/restart the web service.

The existing `GET /health` endpoint is a liveness check only. It does not prove database reachability, phone-provider authentication, or end-to-end web-to-API connectivity. A live phone lookup with authorized consent and valid account credentials is required to verify provider connectivity. Verify Morocco (+212) coverage with the provider account before enabling production claims; public documentation does not guarantee identical data coverage for every Moroccan carrier.

## Validation

Tests cover provider response mapping, timeout/rate-limit/error handling, authentication and role checks, consent, E.164 validation, and conservative dual-provider aggregation. A green fixture-based CI run proves code paths, not live provider credentials or third-party connectivity.
