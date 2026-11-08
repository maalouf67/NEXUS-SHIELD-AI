# NEXUS SHIELD AI — MASTER BUILD SPECIFICATION

## Enterprise Cyber Defense, AI Intelligence & Security Operations Platform

## 1. PROJECT IDENTITY

- **Project:** NEXUS SHIELD AI
- **GitHub Repository:** https://github.com/maalouf67/NEXUS-SHIELD-AI
- **Default Branch:** main
- **Architecture:** Modular Monorepo
- **Product Type:** Enterprise Cybersecurity Platform
- **Current hosting/deployment target:** Vercel for the web application and Express API; other services must use an explicitly suitable runtime.

Build a unified, scalable, secure and production-oriented cybersecurity platform by extending the existing GitHub project.

**Critical requirement:** Preserve all existing code, functionality, security controls, migrations, tests, documentation and integrations. Do not rebuild the application from scratch.

## 2. MASTER REPOSITORY STRUCTURE

The following is the target logical structure, not an instruction to create empty folders. Reuse existing directories and files wherever they already serve the same purpose. Create new directories only when a real module is implemented.

```text
NEXUS-SHIELD-AI/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   ├── soc/
│   │   │   ├── active-defense/
│   │   │   ├── threat-intelligence/
│   │   │   ├── threat-map/
│   │   │   ├── attack-paths/
│   │   │   ├── digital-twin/
│   │   │   ├── ai-assistant/
│   │   │   ├── vulnerability-management/
│   │   │   ├── malware-scanner/
│   │   │   ├── link-protection/
│   │   │   ├── phone-reputation/
│   │   │   ├── ip-reputation/
│   │   │   ├── social-protection/
│   │   │   ├── incidents/
│   │   │   ├── alerts/
│   │   │   ├── users/
│   │   │   ├── workspaces/
│   │   │   ├── billing/
│   │   │   ├── settings/
│   │   │   ├── help/
│   │   │   ├── contact/
│   │   │   ├── privacy/
│   │   │   └── api/
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   ├── soc/
│   │   │   ├── security/
│   │   │   ├── threat-map/
│   │   │   ├── attack-graph/
│   │   │   ├── charts/
│   │   │   ├── tables/
│   │   │   ├── navigation/
│   │   │   └── common/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── services/
│   │   ├── api/
│   │   ├── data/
│   │   ├── utils/
│   │   ├── styles/
│   │   └── public/
│   ├── android/
│   │   ├── app/
│   │   ├── vpn/
│   │   ├── dns/
│   │   ├── scanner/
│   │   └── security/
│   └── mobile/
│       ├── src/
│       ├── screens/
│       ├── navigation/
│       ├── components/
│       ├── services/
│       ├── secure-storage/
│       └── native-modules/ios/
├── services/
│   ├── api/src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── sessions/
│   │   ├── workspaces/
│   │   ├── permissions/
│   │   ├── incidents/
│   │   ├── alerts/
│   │   ├── security-events/
│   │   ├── active-defense/
│   │   ├── middleware/
│   │   ├── attack-paths/
│   │   ├── assets/
│   │   ├── digital-twin/
│   │   ├── threat-intelligence/
│   │   ├── malware-scans/
│   │   ├── ip-reputation/
│   │   ├── phone-reputation/
│   │   ├── link-protection/
│   │   ├── social-protection/
│   │   ├── subscriptions/
│   │   ├── audit/
│   │   ├── observability/
│   │   └── config/
│   ├── ai/app/
│   │   ├── agents/
│   │   ├── orchestrator/
│   │   ├── threat-detection/
│   │   ├── risk-analysis/
│   │   ├── anomaly-detection/
│   │   ├── attack-correlation/
│   │   ├── recommendations/
│   │   └── security/
│   └── workers/
│       ├── event-processing/
│       ├── threat-feed/
│       ├── notifications/
│       └── retention/
├── packages/
│   ├── shared/
│   ├── contracts/
│   ├── security-types/
│   └── configuration/
├── database/
│   ├── init/
│   ├── migrations/
│   ├── seeds/
│   ├── indexes/
│   ├── policies/
│   └── backups/
├── infrastructure/
│   ├── docker/
│   ├── cloudflare/
│   ├── ovhcloud/
│   ├── railway/
│   ├── monitoring/
│   └── deployment/
├── security/
│   ├── active-defense/
│   ├── waf/
│   ├── intrusion-prevention/
│   ├── vulnerability-scanning/
│   ├── secret-scanning/
│   ├── security-policies/
│   └── incident-response/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── api/
│   ├── e2e/
│   ├── security/
│   ├── performance/
│   └── mobile/
├── docs/
│   ├── architecture/
│   ├── security/
│   ├── integrations/
│   ├── database/
│   ├── deployment/
│   ├── incident-response/
│   └── implementation-status/
├── .github/workflows/
├── AGENTS.md
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## 3. COMPLETE FEATURE CATALOG

### A. Security Operations Center (SOC)
- Unified security dashboard, incidents, alerts and event ingestion/review.
- Event timelines, investigation records, severity classification and audit history.
- Analyst and administrator workflows.
- Real-time updates only when a verified event source exists.

### B. Active Defense & Intrusion Prevention
- Global API rate limiting and login abuse prevention.
- Suspicious HTTP request detection, temporary source containment and IP reputation signals.
- Session revocation, security event recording and reversible response actions.
- Edge WAF, host firewall and DDoS protection at the appropriate infrastructure boundary.
- Preserve existing IPS implementation. Do not confuse HTTP-layer prevention with network-layer firewall protection.

### C. AI Intelligence — 6+1 Agents
Six specialized agents and one central orchestrator:
1. Threat Intelligence Agent.
2. Attack Path Analysis Agent.
3. Vulnerability Assessment Agent.
4. Incident Investigation Agent.
5. Network Security Agent.
6. Defense Recommendation Agent.
7. Central AI Orchestrator.

Requirements: typed input/output contracts; evidence-based analysis; source provenance and confidence; bounded execution time; usage and audit logging; provider availability checks; human approval before high-impact actions. Activate only agents with real implementations and tests. Never represent placeholders as functioning agents.

### D. Cyber Threat Intelligence
- Threat Intelligence, Predictive Risk Analytics, Anomaly Detection, Attack Pattern Correlation, Early Warning and AI Security Analyst.
- Verified external threat-feed integrations.
- Evidence freshness and source confidence.

### E. Global Cyber Threat Map
- Geographical visualization of verified threat data.
- Threat categories and severity filtering, historical statistics and source attribution.
- Privacy-safe location aggregation.
- Never generate fake global attacks or fabricate geographical data.

### F. Attack Path Intelligence
- Asset inventory and relationship management.
- Evidence-backed attack-path graph and risk prioritization.
- Bounded graph traversal and Digital Security Twin integration.
- Preserve the deterministic, read-only analysis engine. Do not claim analysis proves exploitability.

### G. Digital Security Twin
- Asset and relationship representation, security posture snapshots, risk-state visualization and historical comparisons.
- Integrate with Attack Path Intelligence.
- Reuse existing asset inventory and evidence sources; do not create duplicate databases.

### H. Malware Protection
- ClamAV integration, private file quarantine, file hashing, scan history and file ownership isolation.
- Malware verdicts, retention/deletion policy, failure and timeout handling.
- Preserve existing web upload gateway and native Android on-demand file scanning.

### I. Link, Scam and Reputation Protection
- Malicious URL assessment, suspicious domain analysis, IP and phone reputation, phishing indicators.
- Source evidence, confidence, user consent and API quotas.
- Keep existing AbuseIPDB, IPQS and SEON adapters correctly identified.
- Do not claim Malwarebytes integration unless its official API contract is verified and implemented.

### J. Mobile Security
- Preserve native Android application and limited DNS-over-TLS protection using Quad9.
- Preserve user-initiated malware scanning.
- Integrate secure authentication and session revocation.
- Add React Native foundation only after reviewing its branch.
- Develop iOS functionality only within Apple's approved Network Extension capabilities and entitlements.
- Do not advertise DNS-only filtering as full-device antivirus or full-network protection.

### K. Account and Workspace Management
- Secure login; RBAC for Administrator, Analyst and read-only Viewer.
- Workspace/tenant isolation; JWT session management.
- Single-session logout, logout-all-sessions and administrator session revocation.
- MFA readiness and audit records.
- Enforce tenant ownership at database query and API authorization layers, not merely in the UI.

### L. Premium and Subscription System
- Free/Premium plans, subscription entitlements, usage limits and feature access control.
- Billing integration, payment webhook verification, idempotent updates, history, cancellation and renewal handling.
- Never store raw card data. Keep billing disabled until a real provider is configured and validated.

## 4. TECHNOLOGY STACK

Preserve the technologies already used:
- Next.js / React / TypeScript for web.
- Node.js / Express / TypeScript for API.
- Python / FastAPI for scanning service.
- PostgreSQL for persistent data.
- Docker for local and isolated service environments.
- ClamAV for file scanning.
- GitHub Actions for CI/CD and verification.
- Trivy for filesystem, dependency, secret and container-image security scanning.
- Existing native Android application.
- React Native and Swift modules only after reviewing their current draft branch implementations.

Use modular service boundaries. Do not convert the monorepo into unnecessary microservices.

**Hosting constraint:** Vercel is suitable for the Next.js web app and compatible serverless API routes/functions. Persistent workers, ClamAV daemons, long-running FastAPI services and stateful network-security components require a suitable container/VM/worker runtime (for example, a separately approved OVHcloud deployment). Do not pretend Vercel alone hosts every workload in this specification.

## 5. SECURITY AND DATA ARCHITECTURE

- TLS in transit; secure password hashing.
- HttpOnly, Secure and SameSite cookies where appropriate.
- JWT validation and session revocation.
- Strict input validation and least-privilege permissions.
- Tenant-level data isolation; transactions and safe migrations.
- Secure secret management, request throttling and security event logging.
- Retention controls, backup/recovery procedures and safe error handling.
- Protection against SQL injection, XSS, CSRF, SSRF and path traversal.
- Auditability of administrator actions.
- AI must never receive unrestricted database or infrastructure access.
- Automatic containment must be reversible, bounded and audited.
- High-impact actions require explicit human approval.
- No offensive retaliation, unauthorized external scanning or exploitation.

## 6. USER INTERFACE AND VISUAL IDENTITY

Create a premium cybersecurity command center:
- Deep navy and near-black backgrounds.
- Strong electric blue primary accent; restrained cyan highlights.
- Clear security-state indicators, professional typography and refined cards/tables/visualizations.
- Smooth but restrained animations.
- Responsive mobile and desktop layouts.
- Arabic RTL and English LTR support.

Required navigation:
1. Overview.
2. SOC Operations Center.
3. Active Defense.
4. Threat Intelligence.
5. Global Threat Map.
6. Attack Path Intelligence.
7. Digital Security Twin.
8. AI Security Assistant.
9. Vulnerability Management.
10. Malware Scanner.
11. Link & Scam Protection.
12. IP & Phone Reputation.
13. Mobile Security.
14. Incident Management.
15. Alerts & Security Events.
16. Users & Permissions.
17. Workspaces.
18. Premium & Subscriptions.
19. Settings.
20. Help and Privacy.

Every screen must connect to a real API or explicitly display its unavailable/not-configured status. No decorative buttons that do nothing.

## 7. GITHUB SOURCE INTEGRATION

Before implementation:
- Inspect default `main` and all relevant available development branches.
- Review existing modules, PR diffs, CI results and dependencies.
- These branches and PRs are not automatically equivalent to features merged into main.

Review these development references where they exist:
- Draft PR #14 — React Native and iOS DNS foundation.
- Draft PR #18 — PostgreSQL non-root hardening.
- PR #19 — Database-backed threat and attack-path dashboard.
- PR #21 — Integration strategy and 6+1 agent design.
- PR #22 — API readiness tests.
- PR #23 — AI coding-agent safety instructions.
- Draft PR #26 — Active Defense and Intrusion Prevention.
- Draft PR #27 — Mobile secure logout.
- Draft PR #28 — PostgreSQL session revocation and logout integration.

Review branches where available:
- `feat/nexus-platform-phase-1`
- `feat/nexus-shield-mvp`
- `feat/attack-path-intelligence-foundation`
- `feat/active-defense-ips-baseline`

Resolve dependencies and conflicts deliberately. Preserve history and avoid blindly merging stacked pull requests.

## 8. IMPLEMENTATION AND RELEASE PHASES

### Phase 0 — Repository audit
- Import GitHub; inspect existing modules.
- Build feature/file inventory and identify missing functionality.
- Map dependencies and APIs.
- Back up before structural changes.

### Phase 1 — Platform foundation
- Stabilize monorepo.
- Verify Web, API, AI and database connectivity.
- Preserve current authentication and RBAC.
- Validate migrations and tests.

### Phase 2 — Existing security capabilities
- Integrate Active Defense, Attack Path Intelligence, ClamAV and security events/SOC.
- Integrate existing IP/phone reputation adapters.
- Integrate database-backed sessions and logout.

### Phase 3 — Intelligence expansion
- Build 6+1 agent architecture.
- Integrate verified threat intelligence.
- Build global threat map and Digital Security Twin.
- Implement evidence-backed risk analysis.

### Phase 4 — Mobile and account protection
- Preserve Android.
- Validate React Native and iOS foundations.
- Improve authentication and workspace isolation.
- Add secure session controls.

### Phase 5 — Product expansion
- Link/scam protection, social account protection, Premium plans and subscription management.

### Phase 6 — Security verification
- Full Build and Test.
- Trivy filesystem and image scans.
- API/database integration tests and authorized security tests.
- Dependency and secret review.
- Failure handling and recovery validation.
- Detailed release-readiness report.

## 9. NON-NEGOTIABLE DEVELOPMENT RULES

1. Never delete an existing source file without explicit approval.
2. Never rename or restructure existing project directories unnecessarily.
3. Never overwrite functional code without comparing its current implementation.
4. Never create duplicate APIs, services, migrations, components or database tables.
5. Never replace real integrations with mock implementations.
6. Never create fabricated threat statistics, security events or AI findings.
7. Never expose secrets or private tokens to frontend code.
8. Never disable Trivy checks to conceal vulnerabilities.
9. Never suppress HIGH or CRITICAL findings without a documented security decision.
10. Never claim an integration is connected when credentials or live connectivity have not been verified.
11. Never merge into `main` without explicit authorization.
12. Never deploy to Railway, OVHcloud or another production environment without explicit approval.

Use a dedicated integration branch and small, reviewable commits. If a destructive change appears necessary, stop and report the reason.

## 10. TESTING AND ACCEPTANCE CRITERIA

A feature is implemented only when:
- Source code exists.
- API contracts are defined.
- Database requirements are satisfied.
- Authentication and authorization are enforced.
- Relevant automated tests pass.
- Failure scenarios are covered.
- UI functions connect to real backend operations.
- Logs and audit records are verified.
- Documentation describes actual behavior.
- Integration status is independently verified.

Classify every feature as:
- IMPLEMENTED AND TESTED.
- IMPLEMENTED, NOT FULLY TESTED.
- PARTIALLY IMPLEMENTED.
- EXPERIMENTAL.
- MOCK / DEMO.
- NOT IMPLEMENTED.
- EXTERNAL INTEGRATION NOT CONFIGURED.
- BLOCKED BY EXTERNAL REQUIREMENTS.

## 11. FINAL DELIVERABLES

At completion, provide:
1. Complete architecture tree.
2. GitHub-to-hosting integration report.
3. File preservation and change report.
4. Implemented features inventory.
5. Incomplete features inventory.
6. External integrations status.
7. Database schema and migration report.
8. Security and Trivy report.
9. Build and test results.
10. Deployment-readiness assessment.
11. Remaining technical blockers.
12. Next implementation priorities.

Do not report completion based on generated files alone.

## FINAL DIRECTIVE

Build NEXUS SHIELD AI as a unified, modular cybersecurity platform using the existing GitHub project as its source of truth.

Preserve existing capabilities, integrate reviewed feature branches, develop missing features incrementally, verify every connection, and maintain accurate implementation status.

The objective is not simply to create a visually impressive dashboard. The objective is to create a functioning, testable, evidence-driven security platform with secure infrastructure, persistent records, real integrations, intelligent analysis and controlled defensive response.

**NEXUS SHIELD AI — INTELLIGENCE. PROTECTION. CONTROL.**
