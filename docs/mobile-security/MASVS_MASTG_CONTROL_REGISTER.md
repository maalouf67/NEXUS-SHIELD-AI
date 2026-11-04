# OWASP MASVS / MASTG release control register

## Purpose

Use the OWASP Mobile Application Security Verification Standard (MASVS) as the control baseline and the Mobile Application Security Testing Guide (MASTG) as the practical test procedure set for NEXUS Android and iOS releases.

This register is a work plan, not a certification or proof of compliance. All controls start as **NOT VERIFIED** until evidence is attached to a specific build, device/OS combination and test date.

## Control groups

| Group | Release verification focus | Current status |
|---|---|---|
| MASVS-STORAGE | No secrets or unnecessary personal data in logs, preferences, backups, local databases or caches; sensitive data encrypted at rest where required | NOT VERIFIED |
| MASVS-CRYPTO | Approved platform cryptography, sound key lifecycle, no hard-coded cryptographic keys or custom crypto | NOT VERIFIED |
| MASVS-AUTH | Secure session lifecycle, role enforcement, re-authentication for sensitive actions, token expiry and logout behavior | NOT VERIFIED |
| MASVS-NETWORK | TLS validation, no cleartext sensitive traffic, server authentication, safe certificate handling, no credentials in URLs | NOT VERIFIED |
| MASVS-PLATFORM | Least-privilege permissions, secure IPC/deep links, intent handling, WebView configuration and platform APIs | NOT VERIFIED |
| MASVS-CODE | Dependency hygiene, release build configuration, secure update process, input validation and error handling | NOT VERIFIED |
| MASVS-RESILIENCE | Signing, integrity signals, debug exposure review, tamper/reverse-engineering resilience appropriate to product risk | NOT VERIFIED |
| MASVS-PRIVACY | Consent, data minimization, purpose limitation, retention, deletion and user transparency | NOT VERIFIED |

## Required release evidence

For each Android and iOS release candidate, record:

1. Application version, build number, commit SHA and artifact SHA-256.
2. Device model, OS version, emulator/simulator version and test account role.
3. MobSF static-analysis report, triaged findings and false-positive rationale.
4. MASTG test IDs executed, expected/actual result and evidence link.
5. Manual checks for authentication, network traffic, sensitive storage, platform permissions and privacy behavior.
6. Any accepted risk, compensating control, owner and expiry/review date.
7. Sign-off by an authorized reviewer.

## Stop-ship rules

- Any unresolved Critical or High finding affecting secrets, authentication, authorization, data exposure or remote code execution blocks release.
- A scanner score alone is not a pass. MobSF/MASTG tools may produce false positives and false negatives; analyst review is required.
- Do not mark a control PASS solely because a tool did not report a finding.
- Do not use real customer data, production credentials or third-party apps without documented authorization in dynamic analysis.

## References

- OWASP MASVS: https://mas.owasp.org/MASVS/
- OWASP MASTG: https://mas.owasp.org/MASTG/
- MASTG testing tools: https://mas.owasp.org/MASTG/tools/
