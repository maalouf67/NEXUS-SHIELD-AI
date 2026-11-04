# Security integration status

This document distinguishes code present in the repository from integrations that have been configured and verified in a live deployment.

| Capability | Integration in repository | Live/deployment status |
|---|---|---|
| Quad9 DNS-over-TLS | Existing Android DNS-only VPN path | Requires user VPN consent and real-device validation for each supported Android build |
| ClamAV | Existing isolated scanner container and authenticated upload flow | CI exercises a local container; production scanner host and signature update health must be monitored |
| AbuseIPDB | New server-side public-IP reputation adapter, API route, consent, quotas and analyst page | Requires an authorized API key in the Express API secret manager and a live test against an approved public IP |
| OWASP MASVS / MASTG | New Android/iOS release control register and evidence/stop-ship process | All controls are NOT VERIFIED until test evidence is recorded for a specific artifact and device/OS |
| OpenTelemetry | Opt-in OTLP/HTTP API server spans and a local-only collector profile | Disabled by default; requires collector startup and an endpoint configured on the API host |
| Mobile reverse engineering | Optional isolated MobSF v4.6.4 Docker profile plus analyst toolchain guidance | Not part of production runtime; requires a controlled analysis host and authorized test samples |

## Operational truth

- Existing Quad9 and ClamAV repository code must not be interpreted as proof that a production device or production service is connected.
- AbuseIPDB tests are fixture-based until a real server-side key is installed and an authorized live request succeeds.
- MASVS/MASTG is a verification process, not a software package or a certification. No group is marked passed in the control register.
- OpenTelemetry spans currently cover HTTP method, status and a fixed route group only. PostgreSQL and provider auto-instrumentation are not installed.
- MobSF, Frida, Apktool, JADX and Ghidra are analyst tools. Do not bundle them into the proprietary mobile application or expose the lab to the public internet.
