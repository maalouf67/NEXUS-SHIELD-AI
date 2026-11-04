# Phone reputation scanner

## Architecture

The web page calls the same-origin Next.js server route:

`POST /api/nexus/phone-reputation/check`

The Next.js route forwards the authenticated session to the Express API:

`POST /api/phone-reputation/check`

The Express API requires a valid JWT and the Admin or Analyst role, enforces explicit user consent and a limit of five checks per account every 15 minutes, then calls the configured provider adapters from the server. The browser and mobile bundles never receive provider credentials.

## Providers

### IPQualityScore

The server adapter uses the Phone Number Validation API. Configure `IPQS_API_KEY` on the Express API server only. For numbers beginning with `+212`, the adapter passes `country[]=MA`. `IPQS_PHONE_STRICTNESS` accepts 0, 1, or 2 and defaults to 0.

### SEON

The server adapter uses the standalone SEON Phone API v2 with a POST request and the `X-API-KEY` header. It sends the international digits without the leading plus sign as the `phone` JSON field. Configure `SEON_API_KEY` on the Express API server only.

Set `SEON_PHONE_API_URL` to the exact endpoint assigned to the SEON account's Transaction Processing Environment. Allowed HTTPS endpoints are:

- Global: `https://api.seon.io/SeonRestService/phone-api/v2`
- Middle East: `https://api.me-central-1-main.seon.io/SeonRestService/phone-api/v2`
- US: `https://api.us-east-1-main.seon.io/SeonRestService/phone-api/v2`
- APAC: `https://api.ap-southeast-1-main.seon.io/SeonRestService/phone-api/v2`

The API rejects non-HTTPS endpoints, unrecognized hostnames, and paths outside the official Phone API endpoint to reduce SSRF risk.

Do not assume that the Middle East endpoint is correct for every account. Confirm the assigned TPE endpoint in the SEON account or with SEON support. SEON documents phone data including carrier, disposable status, online-profile aggregates, consortium fraud history and a phone network risk score. Its documentation says a phone network risk score above 80 is risky and should be reviewed. The implementation uses that only as a suspicious signal; it does not treat a score as proof of fraud.

## Aggregation policy

- An explicit IPQualityScore `spammer=true` is surfaced as a strong malicious signal.
- IPQualityScore score >=75, `risky=true`, or `recent_abuse=true` maps to suspicious.
- SEON score >80, invalid/disposable phone signal, any fraudulent-decline hit, or any fraud-history flag maps to suspicious.
- A provider may return safe only when all required low-risk signals are present and explicit.
- The combined result is safe only when both providers successfully return complete safe assessments.
- Any explicit malicious signal takes priority; otherwise any suspicious signal produces suspicious.
- Provider disagreement is marked as a conflict.
- One provider unavailable means coverage is partial; two unavailable means no coverage. Missing signals and failures never become safe.

These are conservative application rules, not claims that either provider guarantees caller legitimacy or caller identity.

## Shared provider quota

SEON documents a shared license-level limit of two requests per second for trial keys and 20 requests per second after the trial period. The application also applies a per-account five-lookups-per-15-minutes limit. That per-account limit alone is not a distributed license quota: before exposing the feature to multiple API replicas or a large user base, configure a shared rate-limit store or equivalent centralized quota control aligned with the SEON plan. HTTP 429 responses are surfaced as rate-limited provider results and never as safe.

## Privacy and operations

- The page requires explicit consent before submitting a number to configured services.
- The Express API never persists the submitted number or raw provider response.
- Responses use `Cache-Control: no-store`.
- Never log phone numbers, provider payloads, API keys, or credential-bearing URLs.
- Keep `IPQS_API_KEY` and `SEON_API_KEY` in the server-side secret manager of the environment hosting the Express API. Do not place them in `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, browser storage, app bundles, GitHub source files, or this repository.
- If one provider is not configured, the API reports the provider status and the overall result cannot be safe.
- Automated provider tests use deterministic fixtures; they do not make live billable requests.

## Server connectivity and deployment

This feature requires all of the following connections:

1. Public HTTPS web deployment to the Next.js application.
2. The Next.js server's private/server-only `API_BASE_URL` must point to the reachable Express API origin, for example `https://api.example.com`. Do not use `127.0.0.1` unless the web and API processes share the same network namespace.
3. The Express API must listen on the interface required by its hosting platform. In container/cloud hosting, set `HOST=0.0.0.0` only when the platform requires it; keep local development loopback-only.
4. The Express API host must allow outbound HTTPS to the configured IPQualityScore and SEON API hosts.
5. The API's `DATABASE_URL` must point to the intended PostgreSQL service. Configure TLS and the provider CA as required by that database host.
6. Configure the provider keys only in the Express API service's secret/environment settings, then redeploy/restart that service.
7. Configure `API_BASE_URL` in the Next.js server environment and redeploy/restart the web service.

The existing `GET /health` endpoint is a liveness check only. It does not prove database reachability, phone-provider authentication, or end-to-end web-to-API connectivity. A live phone lookup with authorized consent and valid account credentials is required to verify provider connectivity. Verify Morocco (+212) coverage with the provider account before enabling production claims; the public documentation does not guarantee identical data coverage for every Moroccan carrier.

## Validation

Tests cover provider response mapping, timeout/rate-limit/error handling, authentication and role checks, consent, E.164 validation, and conservative dual-provider aggregation. A green fixture-based CI run proves code paths, not live provider credentials or third-party connectivity.
