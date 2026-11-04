# Public IP reputation

## Scope

NEXUS SHIELD AI exposes a consent-based, analyst-only lookup:

`POST /api/nexus/ip-reputation/check` (Next.js same-origin BFF)

The Express API checks one globally routable IPv4 or IPv6 address through the official AbuseIPDB API v2 `/check` endpoint. API keys are sent only in the server-side `Key` header over HTTPS. The key is never sent to the browser or mobile application.

## Input validation

- Accept one IPv4 or IPv6 address, not a CIDR range or hostname.
- Reject private, loopback, link-local, multicast, reserved, mapped and other non-unicast addresses before contacting AbuseIPDB.
- Require a valid Admin or Analyst session and explicit consent.
- Do not accept user-controlled provider URLs or request headers.

## Assessment policy

The application uses the AbuseIPDB `abuseConfidenceScore` and `totalReports` values:

- `malicious`: score >= 90 and at least 5 reports in the selected age window.
- `suspicious`: score >= 25 or at least 3 reports.
- `safe`: score is exactly 0 and report count is exactly 0.
- `unknown`: required fields are missing, inconsistent or unavailable.

These are product display thresholds, not AbuseIPDB guarantees. A high score is a reputation signal about an IP address, not proof that a particular person, device or current session is malicious. Shared hosting, VPNs, NAT, cloud infrastructure and IP reassignment can affect the result. The provider's whitelist flag is displayed as context and is not used as the decision rule.

The adapter requests only the score and summary metadata. It does not request verbose report records, reporter identities or report comments.

## Request and provider budgets

The current application defaults are:

- 10 requests per authenticated account per 15 minutes.
- 30 requests per source IP per 15 minutes.
- 850 AbuseIPDB checks per provider key in a shared 24-hour limiter window.

The shared provider budget deliberately reserves headroom below the documented Standard check quota of 1,000 requests/day. Set `ABUSEIPDB_DAILY_LIMIT` below the contracted plan limit. A larger value must be chosen only after confirming the account's paid quota. Provider HTTP 429 responses are treated as unavailable/rate-limited and never as safe.

`ABUSEIPDB_MAX_AGE_DAYS` defaults to 90 and is validated from 1 to 365.

## Privacy and operation

- IP addresses and raw provider payloads are not persisted by this adapter.
- Responses use `Cache-Control: no-store`.
- Never log API keys, IP addresses, request query strings or raw provider responses.
- `ABUSEIPDB_API_KEY` belongs only in the Express API server's secret manager.
- Never add the key to `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, browser storage, mobile bundles or Git history.
- The UI requires explicit consent before submitting the public IP address to AbuseIPDB.

## Tests and limitations

Unit tests use deterministic mocked responses. They verify public-address filtering, request headers, score mapping, missing fields and rate-limit handling. They do not prove a live API key, paid plan entitlement, provider reachability or data coverage for any specific IP. A real provider round trip requires an authorized operator and valid server-side credentials.
