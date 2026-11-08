# Cloudflare WAF + SecIron IronWALL rollout

**Status: preparation only — no provider account is connected and no live protection has been enabled.**  
**Branch:** `feat/cloudflare-sec-iron-protection`  
**Reviewed:** 2026-11-08

This document is an integration and acceptance plan, not evidence that Cloudflare or SecIron is protecting a deployed NEXUS environment. No DNS, nameserver, firewall, production policy, signing key, or vendor upload has been changed.

## 1. Repository baseline reviewed

The source reviewed for this plan is the `feat/active-defense-ips-baseline` branch at commit `6ed84e1b59bb270fca5f19d721f1a506bfd457af`.

- NEXUS has a Next.js web console and an Express/TypeScript API.
- The Express API already has PostgreSQL-backed request throttling, login-failure limits, HTTP anomaly detection and SOC event persistence in the active-defense branch. These controls are application-layer safeguards; they are not an edge WAF or network-layer IPS.
- Express currently trusts a numeric `TRUST_PROXY_HOPS` value (0–5). The correct value is deployment-topology-specific and has not been established for the intended Cloudflare → hosting-provider → API path.
- The Android companion is a native Java/Gradle application. Its current Gradle configuration uses application ID `ai.nexusshield.mobile`, minSdk 26 and targetSdk 36. The Android README states that CI produces a debug artifact; a production-signed release and physical-device validation are still required before a hardening proof of concept.
- The API scanner permits files up to 100 MiB (`104,857,600` bytes) by default. This must be reconciled with the Cloudflare upload limit before the scan upload hostname is proxied.

## 2. Cloudflare WAF — web and API perimeter

### 2.1 Prerequisites and DNS safety

Before onboarding:

1. Confirm the exact NEXUS hostnames (for example, web and API hostnames) and the hosting provider/origin for each.
2. Export and review the complete current DNS zone. Record A, AAAA, CNAME, MX and TXT records, including SPF, DKIM, DMARC, domain-verification and third-party service records.
3. Check DNSSEC state at the registrar. Do not change nameservers while an incompatible DNSSEC delegation is active.
4. Add the zone to Cloudflare and compare every imported record with the authoritative current zone. Cloudflare's DNS import is not guaranteed to discover every record.
5. Proxy only the intended HTTP/HTTPS web and API hostnames. Keep mail, verification and other non-HTTP records DNS-only unless their provider explicitly documents proxy support.
6. Schedule the nameserver change only after the records and rollback path have been checked. Do not make the change during this repository-only preparation.

Cloudflare onboarding guide: https://developers.cloudflare.com/fundamentals/manage-domains/add-site/

### 2.2 TLS and origin protection

- Use **Full (strict)** after confirming the origin serves HTTPS with an unexpired certificate whose hostname matches the public origin hostname. Do not use Flexible TLS for authenticated NEXUS traffic.
- After traffic is flowing through Cloudflare and health checks are verified, restrict direct access to the origin so a discovered origin address cannot bypass WAF controls. The exact mechanism depends on the hosting provider: origin firewall allowlisting of Cloudflare's published IP ranges, Authenticated Origin Pulls where supported, or an appropriately designed Cloudflare Tunnel.
- Do not blindly apply host firewall commands to a managed host. Confirm provider support, health-check sources, deployment callbacks and any non-HTTP operational access first.
- Keep SSH/administrative access separate from public web proxy records.

TLS guidance: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/  
Origin protection: https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/  
Cloudflare IP ranges: https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/

### 2.3 WAF policy rollout

1. Inventory the public paths and methods, especially login, session, scan upload, AI analysis and health/readiness routes.
2. Enable the Cloudflare Managed Ruleset using its documented defaults first. Do not globally force every disabled rule to Block; Cloudflare warns that doing so can create false positives.
3. If the plan exposes the OWASP Core Ruleset, begin with a non-disruptive/logging or challenge-based evaluation policy, inspect matches against legitimate NEXUS traffic, add narrow exceptions only with evidence, and move suitable rules to blocking after tests.
4. Add route-specific rate limits for authentication and expensive endpoints. Tune them against normal traffic and the existing PostgreSQL-backed application limits; avoid a blanket low limit that affects users behind carrier NAT or shared networks.
5. Keep health checks and operational callbacks working. Do not exempt broad URL trees where only one exact path/method needs an exception.
6. Review WAF events and false positives after each policy change. Keep rollback instructions for each ruleset or custom rule.

Managed rules documentation: https://developers.cloudflare.com/waf/managed-rules/reference/cloudflare-managed-ruleset/  
Rate limiting documentation: https://developers.cloudflare.com/waf/rate-limiting-rules/

### 2.4 Critical upload-size compatibility

NEXUS currently allows up to **100 MiB** for a malware-scan upload. Cloudflare documents a **100 MB** maximum request upload size on Free and Pro, and 200 MB on Business (Enterprise limits are configurable). A 100 MiB file is larger than 100 MB, so the current largest accepted file can be rejected at the edge on Free/Pro.

Before proxying the scan-upload hostname, choose and test one of these options:

- On Free/Pro, lower the NEXUS upload cap to a value safely below the Cloudflare 100 MB limit (and update UI, API and service validation consistently); or
- Design a separate, authenticated, short-lived upload flow to private object storage, with checksum verification and no public unprotected scanner origin. This is a separate engineering change and must be reviewed before use.

Do not set the scan hostname to DNS-only simply to bypass Cloudflare's limit without an explicit threat-model review and origin protection.

Cloudflare 413/upload limits: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/

Also note: WAF request-body inspection is not equivalent to malware scanning. Cloudflare documents that Free-plan managed rules inspect up to 1 MB of request body for body-based matching. ClamAV remains the file-signature inspection component; WAF must not be represented as scanning the full uploaded binary.

Managed-rules body inspection limits: https://developers.cloudflare.com/waf/managed-rules/

### 2.5 Trusted client IP and rate-limit correctness

The API uses Express `req.ip` for rate limiting and anomaly tracking. The current implementation sets Express `trust proxy` to a numeric hop count. Cloudflare must not be treated as trusted merely because a request contains `CF-Connecting-IP` or `X-Forwarded-For`.

Before changing `TRUST_PROXY_HOPS`:

- map the exact path from Cloudflare through the hosting provider to the Express process;
- ensure direct-origin traffic is denied or otherwise authenticated so clients cannot spoof forwarded headers;
- establish which forwarding headers the hosting provider preserves or rewrites;
- test legitimate requests through Cloudflare and direct-origin spoof attempts;
- prove that per-client rate-limit keys represent the real client network and do not collapse all users to a shared proxy IP.

Only then configure the narrowest supported trusted-proxy model and add tests for the deployment path. Do not guess the hop count.

## 3. SecIron IronWALL — Android/iOS binary hardening

SecIron describes IronWALL as a compiled mobile application hardening service for Android and iOS. Its published capabilities include obfuscation/encryption, anti-tampering, anti-repackaging, anti-debugging/anti-hooking and runtime self-protection. The vendor describes applying protection to built binaries and offers SaaS or on-premise deployment options. These are vendor claims and must be demonstrated on the actual NEXUS build.

Official product page: https://www.seciron.com/ironwall-mobile-app-hardening/  
Vendor platform: https://www.seciron.com/

### 3.1 Vendor qualification before any upload

Request a technical proof of concept and written answers covering:

- support for NEXUS's native Java Android app, minSdk 26, targetSdk 36 and current Android Gradle/AGP toolchain;
- exact supported input/output formats (APK, AAB and/or IPA), signing sequence, app-store signing compatibility and reproducible release handling;
- whether a production binary is uploaded to a vendor SaaS service or can remain within an approved on-premise boundary;
- data residency, retention/deletion, subprocessors, access controls, incident notification, and contractual/DPA terms;
- measurable app-size, startup-time, memory and battery impact on representative devices;
- policy options per threat (alert, restrict, suspend or exit), offline behavior, false-positive handling and rollback;
- how runtime events are exported from IronSKY (supported API/webhook/export formats, authentication, rate limits and retention). Do not assume an integration API exists until the vendor confirms it.

Never provide repository write access, production user data, backend secrets, API keys, keystores or signing private keys to the vendor.

### 3.2 Controlled proof of concept

1. Produce a dedicated release-candidate build from a reviewed commit. Do not use the current debug APK as the production candidate.
2. Back up and hash the original binary. Keep the signing key in the existing trusted release environment; do not upload it.
3. Submit only a synthetic/test build and test data under an approved vendor POC agreement.
4. Compare original and hardened builds for package identity, permissions, app launch, authentication, API TLS, malware-scan upload/history, Android VPN consent/foreground notification, and supported OS/device behavior.
5. Run the vendor's demonstrated tests for repackaging, tampering, reverse engineering, debugger/hooking and rooted-device detection in a controlled lab.
6. Measure package size, launch time, memory and battery before/after; record device models and OS versions.
7. Verify the final artifact's signature and integrity with the release process. Run regression tests and a security review before any store submission.
8. Keep protection in alert/observe mode initially where policy allows. Escalate to restrict/exit only after false-positive testing and an owner-approved rollback plan.

Do not claim the mobile app is protected until the hardened release artifact has passed these checks on physical devices.

## 4. Security Operations Center (SOC) event integration

Potential future event sources:

- Cloudflare WAF/security events, if an available account export/API/Logpush method is enabled and tested.
- SecIron IronSKY runtime detections, only after the vendor confirms a supported export interface.

For each source, map events into NEXUS's existing normalized security-event schema with source name, provider event ID, detection type, timestamp, severity, app/build or protected hostname, action and evidence provenance. Minimize personal data; do not ingest raw authentication headers, access tokens, full query strings, or uploaded file contents. Use a dedicated ingestion credential stored only in the server secret manager.

No such provider connector or live event flow is configured by this plan.

## 5. Acceptance gates

### Cloudflare
- [ ] Domain ownership and all current DNS records verified.
- [ ] DNSSEC and nameserver rollback plan checked.
- [ ] Correct web/API hostnames proxied; mail and verification records preserved.
- [ ] Full (strict) TLS verified end-to-end.
- [ ] Origin bypass blocked or protected by an approved origin-authentication design.
- [ ] Actual proxy chain and client-IP attribution verified; no spoofable forwarded-header trust.
- [ ] Managed WAF rules evaluated against normal flows; false positives documented.
- [ ] Login/API rate limits tested with realistic traffic and shared-NAT cases.
- [ ] Scanner upload-size behavior tested against the chosen Cloudflare plan.
- [ ] SOC event export/ingestion verified before claiming central visibility.

### SecIron
- [ ] Vendor POC, legal/privacy review and deployment model approved.
- [ ] Actual supported Android build input/output formats confirmed.
- [ ] Test release hardened and integrity/signature verified.
- [ ] Functional, tamper, runtime and physical-device regression tests passed.
- [ ] Performance and false-positive results recorded.
- [ ] IronSKY event export documented and tested before SOC integration.
- [ ] Owner approves production release after evidence review.

## 6. Current status

| Work item | Status |
|---|---|
| Repository architecture review | Complete for the reviewed branch/commit |
| Cloudflare account / zone connection | Not connected or verifiable |
| DNS / nameserver / proxy changes | Not performed |
| WAF rules deployed | Not performed |
| Origin access restrictions | Not performed |
| Trusted proxy hop count validated | Not yet; deployment path required |
| SecIron vendor account / POC | Not connected or verifiable |
| Hardened Android release artifact | Not produced or tested |
| Cloudflare/SecIron → NEXUS SOC connectors | Not implemented or verified |

**Next required input:** the exact public domain/subdomain intended for NEXUS SHIELD AI (domain name only). Do not send Cloudflare API tokens, passwords, private keys, or vendor credentials in chat.
