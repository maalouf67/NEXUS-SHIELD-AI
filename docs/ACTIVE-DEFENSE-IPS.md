# NEXUS SHIELD AI — Active Cyber Defense & Intrusion Prevention

**Status: API-side prevention layers implemented on a draft feature branch; not merged or production-verified.** This document separates source-code controls from deployment-level capabilities that still require configuration and runtime evidence.

## Objective

Protect NEXUS-owned infrastructure: public API routes, authentication endpoints, application data paths and the services behind the API. This is an internal service-protection capability, not a customer-device protection feature.

## Controls implemented in this branch

1. **Global API request throttling:** the existing API limiter protects `/api` with a 100-request / 15-minute per-source-IP quota. Outside test mode it uses the PostgreSQL-backed shared store, so limits are shared across API instances. Store failures fail closed.
2. **Login abuse prevention:** the login route has a dedicated 10-request / 15-minute source-IP limiter. Successful 2xx logins are excluded from the failed-attempt quota; failed and malformed requests count. Outside test mode, counters use the PostgreSQL store under a separate `auth-login-ip` scope.
3. **Suspicious-response detection and temporary API containment:** the guard observes completed API responses with HTTP 401, 403, 404 or 405. After 40 such responses from one source IP inside a 10-minute window, it emits a deduplicated medium-severity `nexus-ips` event and temporarily returns HTTP 429 for that source until the counter window expires. Successful responses are not counted.
4. **Privacy-safe source identifiers:** PostgreSQL counter keys and SOC event identifiers use keyed HMAC fingerprints. Raw source IP addresses and submitted credentials are not written to the protection event attributes.
5. **Existing HTTP baseline:** Helmet security headers, explicit CORS allow-list behavior, a 1 MB JSON body cap, configured reverse-proxy hop count and Zod validation remain in place.
6. **Fail-closed protection-store reads:** if the anomaly guard cannot read its shared counter, the API returns HTTP 503 instead of silently bypassing that guard. Telemetry persistence is best-effort and does not interrupt a protective response.
7. **HTTP listener hardening:** the Node.js API listener uses a 10-second header receive timeout, 120-second full-request receive timeout, 5-second keep-alive timeout, a maximum of 100 requests per socket and a cap of 100 request headers.


## Request flow

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
Shared API request limiter (100 / 15 min)
  |
  v
Shared API anomaly guard (10 min window)
  |-- completed 401 / 403 / 404 / 405 responses increment a source counter
  |-- 40 suspicious responses -> temporary HTTP 429 containment
  |-- HMAC-fingerprinted event -> SOC analyst review
  |
  +--> /auth/login -> dedicated failed-login limiter (10 / 15 min)
  |
  +--> application routes -> existing authentication / RBAC / validation
```

## What this does not do

- This is **application-layer HTTP containment**. Express cannot filter raw TCP/UDP packets before they reach the host, close a public listener, or absorb a volumetric DDoS attack.
- It is not an operating-system firewall, network IDS/IPS, WAF, endpoint EDR or DDoS scrubbing service. Those controls must be configured at the deployment edge / host network and verified independently.
- It does not inspect arbitrary encrypted traffic, uploaded files or device processes.
- HTTP listener timeouts limit slow or incomplete requests after they reach Node.js; they do not replace upstream connection limits or network-layer SYN/DDoS protection.
- It does not attack, scan, exploit or retaliate against remote systems. Automated action is limited to rate-limiting NEXUS's own inbound API requests for a temporary window.
- IP-based containment is not proof of malicious intent. Mobile-carrier NAT, offices and shared proxies can cause legitimate users to share one public IP.
- The anomaly guard performs a shared-counter read for API requests and a counter increment only after suspicious responses. The added database latency and concurrency behavior require load testing.
- Distributed attacks from many source IPs, compromised credentials and privilege abuse require additional layers.

## Next engineering layers

1. **Deployment perimeter:** configure an edge WAF / DDoS protection service, restrict direct origin access, enforce TLS, and allow only required inbound ports. No WAF or host firewall is claimed until configured and tested in the actual hosting account.
2. **Identity/session defense:** server-side JWT session revocation, MFA for privileged accounts, credential-stuffing detection and safe account recovery.
3. **Cross-source intelligence:** threat feeds with provenance, confidence, age and licensing. Reputation alone must not trigger irreversible blocking.
4. **Graduated response:** alert -> analyst review -> reversible, time-limited source containment. Account disablement, session revocation and production firewall changes require explicit authorization, an audit record and rollback path.
5. **Network sensor (later):** evaluate a narrowly scoped Rust/eBPF sensor only if the chosen hosting platform provides the required host and kernel privileges. It must monitor only NEXUS-owned infrastructure and begin in observe-only mode.
6. **Operational readiness:** shared-store health, false-positive review, event retention, SOC visibility, alerting and incident runbooks.

## Validation required before release

- API build, type-check and full test suite.
- Confirm the login limiter counts failed attempts and does not penalize successful 2xx logins.
- Confirm the anomaly guard only counts 401 / 403 / 404 / 405 responses, returns 429 after the threshold, and does not count successful responses.
- Test database unavailability: the anomaly guard must fail closed.
- Test PostgreSQL counter sharing across two API instances and race behavior under concurrent requests.
- Test event deduplication, HMAC fingerprinting and absence of raw IP / email / password in event attributes.
- Verify `TRUST_PROXY_HOPS` against the actual deployment edge; never trust arbitrary forwarded headers.
- Load test legitimate NAT / mobile-carrier traffic and document the false-positive recovery process.
- Confirm event visibility in the authenticated SOC interface.
- Configure and separately validate the host firewall, origin lockdown, TLS and edge WAF / DDoS controls.

## Security decision policy

NEXUS may automatically throttle and temporarily contain inbound requests to its own API according to the documented thresholds. It must not retaliate against remote systems, run exploit code, scan third-party targets without authorization, or automatically destroy / quarantine data. AI output remains advisory. High-impact containment requires human authorization, auditability and a rollback path.
