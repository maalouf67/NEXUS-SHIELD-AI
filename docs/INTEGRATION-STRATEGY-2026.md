

## 9. Engineering toolchain — approved roles and guardrails

The tools below complement the existing GitHub repository and CI. They are not interchangeable, and no tool is considered connected merely because it is listed here.

### Jira + GitHub — work tracking and traceability

- Use Jira as the product backlog only after the owner's Atlassian workspace is connected and the project key/permissions are confirmed.
- Link Jira issues to GitHub branches, commits, pull requests and build/deployment status. Put the Jira key in branch names and PR titles when an issue exists (example: `NEXUS-123/feat/threat-feed-adapter`).
- Each issue must include: user outcome, scope, non-goals, security/privacy impact, acceptance criteria, test evidence and rollback note.
- Keep GitHub as the source of truth for code, reviews and CI. Jira tracks intent and delivery; it must not be used to mark a feature complete without merged code and test evidence.
- Until Jira is connected, keep the existing GitHub PR/issue workflow. Do not create a second backlog by copying tasks into another service.

### Aikido Security — developer and supply-chain security

- Evaluate Aikido's repository scanning for SCA, SAST, secrets, licenses, IaC and malware findings. Review and triage findings before enabling blocking policies.
- Add IDE scanning to the developer loop (VS Code, Cursor or another supported IDE) so generated and hand-written changes are reviewed before a PR.
- Add Aikido GitHub Actions / PR gating only after an Aikido workspace is connected, the plan entitlement is confirmed, and a pilot produces stable check names and low-noise results.
- Keep Trivy and existing GitHub checks during the pilot. Do not remove a working scanner or suppress findings simply to obtain a green build.
- Start with report-only on a feature branch; then block only verified Critical/High issues in reachable production paths after documented false-positive review and a tested exception process.
- Never paste API tokens into source, prompts, Jira comments, screenshots or mobile builds. Use the server/CI secret store and least-privilege access.

### React Native + Expo — shared mobile delivery

- Reuse the existing `apps/react-native` Expo application from PR #14 as the candidate shared Android/iOS UI. Do not generate a second React Native app.
- Preserve the existing native Android companion and its Android `VpnService` until an Expo/Kotlin native module has feature parity, real-device tests, lifecycle/reconnect tests and an explicit migration decision.
- Keep the iOS DNS Settings implementation scoped to Apple's user-approved DNS configuration. Do not describe it as a full-device VPN or HTTPS inspection.
- Use Expo's New Architecture, TypeScript, secure storage and EAS/CI build tooling. Run type-check, Expo dependency diagnostics, Android build, iOS simulator build and Swift tests on every mobile change.
- Require signed build artifacts and device evidence before claiming Android/iPhone protection is operational. Simulator or JavaScript bundle success is not real-device validation.
- PR #14 is currently a draft, not merge-ready: at the 2026-11-05 review its head was 31 commits ahead and 11 behind `main`, with a 50-file diff and a merge base at an older commit. Its five recorded workflow runs passed at the reviewed head, but that does not resolve branch divergence or review risk. Split or rebase the work in small, independently reviewed changes.
- PR #14 currently implements phone reputation using IPQualityScore. It is not a Malwarebytes integration. Keep the feature disabled/unavailable until the intended provider's exact product, official endpoint, authentication, data policy, supported regions (including +212), quota and response schema are confirmed.

### Bolt.new — visual prototyping, not a second source tree

- Use Bolt.new to prototype UX flows, responsive layouts and component concepts against a dedicated feature branch.
- Connect only the intended GitHub repository and branch. Disable unnecessary connector actions; do not enable broad write permissions by default.
- Never let Bolt auto-push to `main`, replace backend services, invent API data or create a parallel production project. Export proposed changes through a PR and compare the diff against the existing Next.js / React Native structure.
- Keep the existing NEXUS API, authentication, database and authorization logic authoritative. Bolt-generated mock data must remain visibly labelled as mock.

### AI-native IDEs — controlled coding agents

- Use one primary coding agent per task (for example GitHub Copilot or Cursor) and keep the task bounded to one issue/branch. Use a second agent for independent review, not simultaneous edits to the same files.
- Require agents to inspect the current repository and tests before editing; prohibit broad rewrites, mass file moves, dependency upgrades and direct pushes to `main`.
- Give agents only the minimum connector and repository permissions required. Do not expose production secrets, customer data, signing keys or private threat samples in prompts or context.
- Every AI-generated change must have a human-reviewed diff, relevant tests, security scan and PR. Agent claims are not evidence; command output and CI artifacts are evidence.
- For phone-first work, prefer browser-based tools (GitHub and Bolt) rather than forcing unsupported desktop IDE binaries into Termux. Use local IDEs only when their platform and project toolchain are supported.

### Zapier — optional notifications and business workflow automation

- Restrict Zapier to non-critical notifications and ticket/workflow routing (for example, create a Jira triage ticket after a NEXUS incident is persisted and verified).
- Do not put Zapier in the security decision path: it must never decide that a device is safe, block traffic, quarantine a file, revoke a session or change account permissions.
- Send only a minimal allowlisted event envelope: event ID, event type, severity, creation time, opaque incident reference and a link back to the authenticated NEXUS console. Do not send raw URLs/domains, packet/DNS payloads, IP addresses, file contents, phone numbers, user emails, access tokens or credentials.
- Keep the Catch Hook URL in a server-side secret store. Never commit it or place it in client/mobile configuration. Treat it as a credential.
- Use a durable internal outbox, stable event IDs, idempotent processing, bounded retries with exponential backoff and dead-letter visibility. A webhook HTTP 200 is not proof that a downstream action completed; reconcile important Jira tickets against their source incident.
- Confirm the Zapier plan supports the required webhook triggers and check current per-user/per-Zap limits before enabling the workflow. If Zapier is unavailable or delayed, NEXUS incident persistence and SOC operation must continue unaffected.

## 10. Integration readiness — account and release gates

| Tool | Intended NEXUS use | Current state at review | Required before activation |
|---|---|---|---|
| Jira / Atlassian | Backlog, epics, acceptance criteria and issue-to-PR traceability | Not connected in this workflow | Owner connects the Atlassian app and confirms workspace/project permissions |
| Aikido Security | Repository, IDE and PR security findings | Researched; no workspace connected | Owner connects repository, confirms plan and reviews data-processing settings |
| Bolt.new | UI/UX prototypes on feature branches | Not connected to this repository | Owner connects GitHub with least-privilege permissions and selects a non-main branch |
| React Native / Expo | Shared mobile UI and iOS foundation | Draft PR #14 exists; five recorded checks passed at its reviewed head, but branch is 11 commits behind main | Rebase/split, validate provider contract, Android/iOS builds, entitlements and real devices |
| AI-native IDE | Bounded implementation and independent code review | GitHub workflow available; local IDE choice not standardized | Select one primary agent and apply repo instructions/permission boundaries |
| Zapier | Redacted incident notifications and Jira routing | Not connected; no webhook URL configured | Owner creates a dedicated Zap, stores its URL server-side and tests redaction, retries and reconciliation |

**Activation policy:** account connections, OAuth grants, paid plans, API keys, deployment credentials, app-signing credentials and webhook URLs must be supplied or approved by the owner in their official account settings. No secret belongs in this repository. A tool integration is “active” only after an authenticated test, least-privilege review, failure-mode test and documented owner approval.

## 11. Review evidence added on 2026-11-05

- PR #18: Build/Test and Trivy Security Checks passed on the reviewed head. It remains unmerged because its Railway volume/runtime compatibility note still needs an explicit deployment decision.
- PR #19: still targets `fix/trivy-postgres-nonroot`; its own description identifies workspace-global inventory without tenant ownership. Do not merge it into a multi-tenant product until isolation is implemented and tested.
- PR #22: API Build/Test passed. Trivy failed on the existing `database/Dockerfile.railway` DS-0002 HIGH finding from `main`; the new readiness test file did not cause that finding. Re-run security CI after the non-root image fix is safely incorporated.
- PR #14: its recorded Build/Test, Security, lint/shared-contract, Python and React Native/iOS workflow runs passed at head `c235342207857ddbf5b729e737e32d772602351f`. The branch nevertheless diverges from current `main` and remains a draft; no merge or device validation is claimed.
