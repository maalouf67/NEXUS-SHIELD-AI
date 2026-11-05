# NEXUS SHIELD AI — Active Cyber Defense & Intrusion Prevention

**Status: first API-side prevention slice implemented on a feature branch; not merged or production-verified.** This document distinguishes controls present in source from capabilities still requiring implementation and runtime evidence.

## Objective

Reduce the chance that automated abuse or credential attacks reach sensitive NEXUS API operations. The first release focuses on API perimeter hardening and login abuse prevention. It is not a network firewall, endpoint EDR, WAF, DDoS scrubbing service, or autonomous response platform.

## Controls in this first implementation

1. **Global API request throttling:** the existing API limiter protects `/api` with a 100-request / 15-minute per-source-IP quota. Outside test mode it uses the PostgreSQL-backed shared store, so limits are shared across API instances. Store failures fail closed.
2. **Login abuse prevention:** the login route now has a dedicated 10-request / 15-minute source-IP limiter. Successful 2xx logins are skipped from the quota; failed and malformed requests count. Outside test mode, counters use the shared PostgreSQL store under a separate `auth-login-ip` scope. This prevents one source network from making unlimited guesses through a single API deployment.
3. **Analyst signal:** when the login threshold is exceeded, the API asynchronously attempts to persist one deduplicated `nexus-ips` high-severity security event per source-IP fingerprint and time window. The IP is HMAC-fingerprinted using `RATE_LIMIT_HASH_SECRET` or `SESSION_SECRET`; raw IP addresses and submitted credentials are not included in the event.
4. **Existing HTTP baseline:** Helmet security headers, explicit CORS allow-list behavior, JSON body size cap (1 MB), configured reverse-proxy hop count, and Zod validation remain in place.
5. **Fail-closed behavior:** rate-limit store failures do not silently disable the login limiter. Event telemetry is best-effort and must not interrupt the protective response.

## Current request flow

```text
Client
  |
  v
TLS / deployment edge (must be configured and verified)
  |
  v
Express: trusted proxy hops -> Helmet -> CORS -> 1 MB JSON cap
  |
  v
Shared API source-IP limiter (100 / 15 min)
  |
  +--> /auth/login -> shared failed-login limiter (10 / 15 min)
  |                    |
  |                    +--> threshold exceeded -> HTTP 429
  |                    +--> privacy-preserving security event -> analyst review
  |
  +--> other protected API routes -> existing auth / RBAC / validation
```

## Important limitations

- IP-based rate limits are an abuse control, not proof that a source is malicious. NAT, corporate proxies and mobile carrier networks can cause multiple legitimate users to share one public IP.
- Distributed password guessing across many IPs needs additional identity-aware detection, MFA, breached-password controls and server-side session lifecycle work. Do not add account lockouts without a carefully designed recovery path because attackers could use them for denial of service.
- A PostgreSQL-backed limiter requires the database and `SESSION_SECRET` (or `RATE_LIMIT_HASH_SECRET`) to be configured. The server environment already validates `SESSION_SECRET`; never expose either secret to clients.
- The event is an observable signal, not an automatically confirmed incident. It does not block an IP at the firewall or revoke an account.
- This implementation does not inspect arbitrary packets, TLS payloads, uploaded files, or device processes.
- In-memory local test mode does not validate multi-instance production behavior. The shared PostgreSQL store and event persistence require integration tests and a deployment smoke test.

## Next defense layers

1. Add distributed abuse signals for repeated 401/403/404 patterns and suspicious route enumeration, with bounded cardinality and privacy-preserving identifiers.
2. Introduce identity/session protections: server-side JWT revocation, MFA for privileged users, credential stuffing detection and safe account recovery.
3. Add edge/WAF integration (for example Cloudflare WAF or an equivalent provider) with managed rules, bot controls, origin lockdown, TLS policy and tested rate limits. Do not claim WAF protection until the edge is configured and verified.
4. Connect threat-intelligence sources with provenance, confidence, age and licensing checks. Reputation alone must not trigger irreversible blocking.
5. Add graduated containment: alert -> analyst confirmation -> reversible, time-limited block. Require explicit human approval for account disablement, quarantine, deletion, session revocation and production firewall changes.
6. Add operational monitoring: limiter-store health, threshold events, false-positive review, retention and tested incident runbooks.

## Validation required before release

- API build, lint and full test suite.
- Test that 10 failed login attempts are counted and the next request receives 429 within the configured window.
- Test that successful logins do not consume the failed-attempt budget.
- Test that the counter is shared across two API instances using PostgreSQL.
- Test database unavailability: the login limiter must fail closed and must not permit unlimited authentication attempts.
- Test event deduplication, HMAC fingerprinting and absence of raw IP/password/email in stored event attributes.
- Verify proxy-hop configuration at the actual deployment edge; never trust arbitrary `X-Forwarded-For`.
- Load test legitimate NAT/mobile-carrier traffic and document false-positive handling.
- Confirm alert visibility in the authenticated SOC interface before describing the signal as operational.

## Security decision policy

NEXUS may rate-limit its own API traffic automatically according to published thresholds. It must not retaliate against remote systems, run exploit code, scan third-party targets without authorization, or automatically destroy/quarantine data. AI output remains advisory. High-impact containment requires a human decision, authorization checks, an audit record and a rollback path.
