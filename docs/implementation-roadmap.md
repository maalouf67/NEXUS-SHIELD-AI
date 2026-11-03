# NEXUS SHIELD AI — Implementation Roadmap and Verified Status

Last reviewed: 2026-11-03
Scope: repository implementation and CI evidence only. This document does not claim that a production deployment or on-device continuous protection is active.

## Verified baseline

The latest CI run for commit `624d8b59c7d595ce70ff3a2236f3eba5ddcd54b7` completed successfully:
- Android companion debug build
- Python AI service validation
- Node.js web/API build and tests
- Docker, ClamAV, and web upload integration tests

CI run: https://github.com/maalouf67/NEXUS-SHIELD-AI/actions/runs/41705302704

The Docker/ClamAV integration workflow exercises service startup, benign-file scanning, EICAR test-string detection, and owner-scoped scan history. CI success is not equivalent to a deployed service or on-device antivirus.

## Workstreams (recommended order)

### 1. Stabilize service connectivity and test coverage — CI baseline PASS; follow-up hardening OPEN
- [x] Next.js web app uses a dedicated port separate from Express API.
- [x] Compose starts PostgreSQL, ClamAV, and Python AI service.
- [x] CI exercises upload through the web gateway, benign result, EICAR detection, and owner-scoped scan history.
- [ ] Add CI assertions for expiry cleanup and sample/quarantine deletion behavior.
- [ ] Add API contract tests covering the web-to-Express-to-Python boundaries and failure modes.
- [ ] Confirm secret/configuration validation and safe failure behavior in all environments.

### 2. Unify AI threat analysis — single orchestration route integrated; multi-provider fallback NOT implemented
- [x] Express `POST /threats/analyze` calls the AI orchestrator.
- [x] OpenAI provider adapter uses the structured threat-analysis schema.
- [x] Router selects from providers registered with active capabilities.
- [x] Unit tests cover routing, orchestration, and fallback behavior using test providers.
- [ ] Implement and securely configure additional provider adapters (Anthropic, Gemini, DeepSeek) before advertising real provider failover.
- [ ] Add bounded retries, timeout enforcement, per-tenant budgets, and audit/usage persistence as tested features.
- [ ] Route other AI task types only when a real adapter and capability are implemented.

Important: only OpenAI is currently an implemented provider in the runtime registry. Other provider names are type/policy placeholders; test doubles in unit tests do not make those provider integrations live.

### 3. Continuous mobile protection — NOT IMPLEMENTED
Android companion:
- [x] HTTPS API login, on-demand file selection and scanning, scan-history display.
- [x] Debug build in CI.
- [ ] Android `VpnService` consent and lifecycle flow.
- [ ] Safe DNS/network filtering engine, verified allow/block behavior, and user-visible status.
- [ ] Foreground-service notification, reconnect handling, battery and network interruption tests.
- [ ] Security review of any remote configuration and threat feed.

iOS:
- [ ] Separate iOS app target and user-consented Network Extension design/entitlement review.
- [ ] Implement supported filtering capabilities within Apple platform restrictions.
- [ ] Device testing and Apple signing/entitlement workflow.

Do not describe either platform as full-device antivirus until those capabilities are implemented and tested. OS restrictions prevent NEXUS from freely reading other apps' private files.

### 4. Product and UI development — IN PROGRESS
- [x] Next.js App Router pages and route handlers are the canonical routing system.
- [x] Shared session Context and `useSession` hook.
- [x] Same-origin typed API client and business service helpers.
- [x] Reusable status badge, security data constants, and formatting utilities.
- [x] Static-assets directory structure documented.
- [ ] Add approved project-owned icons, illustrations, and licensed fonts.
- [ ] Split dashboard into smaller components and add focused component tests.
- [ ] Replace demo threat summary with a configured, verifiable threat-intelligence source.
- [ ] Build interactive threat map only after source provenance, freshness, and location privacy controls are in place.
- [ ] Evaluate Redux Toolkit when the application has complex shared client state; it is intentionally not installed now because the shared session is handled by Context.

## Web application layer inventory

| Concern | Canonical location | Status |
| --- | --- | --- |
| API handlers / route handlers | `apps/web/app/api` and `services/api/src` | Present |
| Assets | `apps/web/public/assets` | Directory and usage guide present; actual branded asset pack pending |
| Components | `apps/web/components` | Present; expansion and tests pending |
| Context | `apps/web/context` | Session context/provider integrated |
| Data | `apps/web/data` | Security constants and role helper present |
| Hooks | `apps/web/hooks` | `useSession` present |
| Pages | `apps/web/app` | Next.js App Router present |
| Redux Toolkit | `apps/web/redux` | Not installed; decision documented |
| Services | `apps/web/services` | Typed Nexus API service present |
| Utils | `apps/web/utils` | Format helpers present |

## Release and deployment policy

- No production deployment, release, or publishing is authorized by this roadmap.
- Keep status claims tied to repository code and successful tests.
- A CI pass is evidence for the tested workflows, not proof of production readiness or continuous mobile protection.
