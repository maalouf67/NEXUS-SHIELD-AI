# NEXUS Native iOS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure native NEXUS iOS client foundation backed by Apple identity verification, rotating NEXUS refresh sessions and server-enforced workspace authorization.

**Architecture:** Native SwiftUI with modular MVVM, Clean Architecture boundaries and Swift Concurrency. Backend authentication changes land and pass their security tests before the iOS client depends on them. Existing web and Android applications remain intact.

**Tech Stack:** SwiftUI, Swift Concurrency, AuthenticationServices, Security/Keychain, LocalAuthentication, URLSession, XCTest, existing Express/TypeScript API, PostgreSQL and current repository test tooling.

**Spec:** `docs/superpowers/specs/2026-11-12-nexus-ios-architecture-design.md`  
**API Contracts:** `docs/superpowers/specs/2026-11-12-nexus-ios-api-contracts.md`

## Global Constraints

- Native iOS client; no primary WebView implementation.
- Never store tokens in UserDefaults, plain files, logs or analytics.
- Apple identity tokens are verified by the backend; no Apple private key or client secret in the app.
- Access tokens begin at 15 minutes, matching current backend policy; client honors server expiry metadata.
- Refresh tokens are opaque, single-use, rotated atomically and stored server-side only as hashes.
- Workspace authorization is server-authoritative on every protected request.
- Do not use integration credentials for interactive user sessions.
- Preserve current web and Android paths; avoid destructive restructuring.
- No deployment or App Store submission without explicit approval. The user has authorized merging implementation changes to `main` after required verification gates pass.
- Build/sign iOS with macOS/Xcode; Android-only local workflow cannot run Xcode builds or iOS Simulator.

## Review Focus

- Invalid, expired or replayed Apple credentials must never create or link an account; cover issuer/audience/nonce/signature/expiry failures in Apple verifier tests.
- Concurrent 401s must not reuse a refresh token in parallel; cover a burst of requests with a single-flight TokenCoordinator test.
- Refresh-token reuse must revoke the entire family and produce an auditable security event; cover predecessor replay after successful rotation.
- Workspace ID substitution and stale membership must not expose cross-workspace data; cover member removal, suspended workspace and foreign resource IDs.
- Keychain failures, biometric enrollment changes and offline logout must not leave a partially authenticated UI; cover failed writes, restore and local logout fallback.

---

## File map

### Backend files to create or modify

- Create `database/init/013_apple_identity_and_refresh_sessions.sql`: Apple identity mapping and hashed refresh-token-family persistence, constraints and indexes.
- Modify `services/api/src/auth/auth-session.repository.ts`: refresh-token family persistence and atomic rotation/revocation methods; preserve current access-session behavior.
- Create `services/api/src/auth/apple-identity.verifier.ts`: Apple JWT/JWKS verification and strict claim validation.
- Create `services/api/src/auth/refresh-token.service.ts`: opaque token generation, hashing, rotation, reuse detection and revocation orchestration.
- Modify `services/api/src/auth/auth.routes.ts`: add Apple exchange and refresh routes; extend logout semantics.
- Modify `services/api/src/auth/auth.middleware.ts` only if access-token session claims need a backward-compatible extension.
- Modify `services/api/src/__tests__/auth.test.ts`: endpoint-level auth contract tests.
- Create `services/api/src/auth/apple-identity.verifier.test.ts`: verifier negative and positive tests.
- Create `services/api/src/auth/refresh-token.service.test.ts`: rotation/reuse/revocation unit tests.
- Extend `services/api/src/auth/auth-session.repository.integration.test.ts`: transaction, uniqueness and concurrency tests.
- Modify `services/api/src/__tests__/workspaces.test.ts` and `services/api/src/__tests__/workspace.db.test.ts` only for gaps found by the cross-workspace test matrix.

### iOS files to create

- Create `apps/ios/README.md`: Xcode setup, environment configuration and local test instructions.
- Create `apps/ios/NexusShield.xcodeproj` and `apps/ios/NexusShield/`: native app target and source groups.
- Create `apps/ios/NexusShield/App/NexusShieldApp.swift`: composition root and app lifecycle.
- Create `apps/ios/NexusShield/Core/Networking/APIClient.swift`: typed URLSession transport.
- Create `apps/ios/NexusShield/Core/Networking/APIError.swift`: normalized transport/API errors.
- Create `apps/ios/NexusShield/Core/Security/KeychainStore.swift`: Keychain-only credential persistence.
- Create `apps/ios/NexusShield/Core/Security/TokenCoordinator.swift`: access-token retrieval and single-flight refresh.
- Create `apps/ios/NexusShield/Core/Security/BiometricGate.swift`: optional local privacy gate.
- Create `apps/ios/NexusShield/Features/Authentication/AppleSignInService.swift`: AuthenticationServices bridge and nonce handling.
- Create `apps/ios/NexusShield/Features/Authentication/AuthRepository.swift`: backend Apple exchange, refresh and logout adapter.
- Create `apps/ios/NexusShield/Features/Authentication/AuthenticationView.swift` and `AuthenticationViewModel.swift`.
- Create `apps/ios/NexusShield/Features/Workspace/WorkspaceRepository.swift`, `WorkspaceView.swift` and `WorkspaceViewModel.swift`.
- Create `apps/ios/NexusShield/Domain/Session.swift`, `User.swift` and `Workspace.swift`.
- Create `apps/ios/NexusShieldTests/Security/KeychainStoreTests.swift`, `TokenCoordinatorTests.swift`, `AppleSignInServiceTests.swift`, `APIClientTests.swift` and `WorkspaceRepositoryTests.swift`.

The iOS project file and target settings must be generated/edited on macOS with a pinned Xcode version once the user confirms access to a Mac or hosted macOS runner. Do not hand-author an unverifiable Xcode project or claim a simulator build from Android.

---

## Phase A — Backend contracts and security foundation

### Task 1: Lock down the database migration contract

**Files:**
- Create: `database/init/013_apple_identity_and_refresh_sessions.sql`
- Test: migration validation through the repository's existing database migration workflow; add a dedicated migration test only if the current harness lacks one.

**Interfaces:**
- Apple identity record: provider, provider_subject, user_id, created_at, last_authenticated_at; unique constraint on provider + provider_subject.
- Refresh family record: family_id, session_id, user_id, token_hash, parent_token_id, issued_at, expires_at, consumed_at, revoked_at, reuse_detected_at.
- Store token hashes only; never raw refresh credentials.
- Foreign keys must cascade or revoke consistently with user/session deletion policy.

- [ ] Inspect `docs/DATABASE-MIGRATIONS.md` and the existing `database/init/011_workspace_identity_and_ownership.sql` before writing migration 013.
- [ ] Write migration assertions for uniqueness, foreign keys, expiry indexes and token-hash-only storage.
- [ ] Run the database migration test against a disposable PostgreSQL database.
- [ ] Verify applying migration twice follows the repository's established idempotency convention.
- [ ] Commit only migration and its tests.

### Task 2: Implement Apple identity verification

**Files:**
- Create: `services/api/src/auth/apple-identity.verifier.ts`
- Create: `services/api/src/auth/apple-identity.verifier.test.ts`

**Interfaces:**
- `verifyAppleIdentityToken(input: { identityToken: string; rawNonce: string; expectedAudience: string }): Promise<VerifiedAppleIdentity>`
- `VerifiedAppleIdentity = { subject: string; email?: string; emailVerified?: boolean; isPrivateEmail?: boolean }`
- Inject clock/JWKS retrieval in tests; production verifier uses Apple's published signing keys with bounded cache and key rotation handling.

- [ ] Write tests for valid token and invalid signature, issuer, audience, nonce, expiry, missing subject and malformed claims.
- [ ] Run `npm exec --workspace @nexus-shield/api -- vitest run src/auth/apple-identity.verifier.test.ts`.
- [ ] Implement verifier with strict allow-list of issuer and expected audience.
- [ ] Re-run verifier tests, including JWKS key rotation and unknown key ID.
- [ ] Commit verifier and tests.

### Task 3: Implement refresh-token family service

**Files:**
- Modify: `services/api/src/auth/auth-session.repository.ts`
- Create: `services/api/src/auth/refresh-token.service.ts`
- Create: `services/api/src/auth/refresh-token.service.test.ts`
- Extend: `services/api/src/auth/auth-session.repository.integration.test.ts`

**Interfaces:**
- `issueRefreshToken(input: { userId: string; sessionId: string; familyId: string; expiresAt: Date }): Promise<{ token: string; tokenId: string }>`
- `rotateRefreshToken(input: { token: string; now: Date }): Promise<RefreshRotationResult>`
- `revokeRefreshFamily(familyId: string, reason: RefreshRevocationReason): Promise<void>`
- `revokeAllRefreshFamilies(userId: string, reason: RefreshRevocationReason): Promise<number>`
- Rotation must be one database transaction with row locking/conditional consume; exactly one concurrent use succeeds.

- [ ] Write tests for successful rotation, expired token, revoked token, unknown token, concurrent double use and replay of a consumed predecessor.
- [ ] Verify the replay test asserts family revocation and security audit event creation.
- [ ] Run the focused service and repository integration tests.
- [ ] Implement cryptographically random opaque tokens and SHA-256 token hashing; never return stored hashes.
- [ ] Run focused tests plus existing auth-session integration tests.
- [ ] Commit service, repository changes and tests.

### Task 4: Add Apple and refresh HTTP endpoints

**Files:**
- Modify: `services/api/src/auth/auth.routes.ts`
- Modify: `services/api/src/__tests__/auth.test.ts`

**Interfaces:**
- `POST /api/auth/apple`: body `{ identity_token, nonce }`; returns NEXUS access token, opaque refresh token, expiry metadata, user and session IDs.
- `POST /api/auth/refresh`: body `{ refresh_token }`; rotates token and returns replacement pair.
- Existing `POST /api/auth/logout` and `POST /api/auth/logout-all` additionally revoke refresh families.
- Do not silently link by email. Existing accounts require explicit authenticated linking or a separate verified recovery process.

- [ ] Add failing route tests for success, invalid Apple identity, account-link conflict, rate limit, refresh rotation, refresh replay, logout and logout-all.
- [ ] Run focused auth tests to verify the new cases fail for the expected missing behavior.
- [ ] Implement routes using verifier and refresh service; use generic public errors and `Cache-Control: no-store`.
- [ ] Run auth route, verifier, refresh service and auth-session integration suites.
- [ ] Run full API test suite, TypeScript typecheck, lint and security checks.
- [ ] Commit backend endpoints and tests.

### Task 5: Prove workspace authorization boundaries

**Files:**
- Modify only if needed: `services/api/src/workspaces/workspace.middleware.ts`, `services/api/src/workspaces/workspaces.routes.ts`, relevant feature route handlers.
- Extend: `services/api/src/__tests__/workspaces.test.ts`, `services/api/src/__tests__/workspace.db.test.ts`.

**Interfaces:**
- Preserve `X-NEXUS-WORKSPACE-ID` selector.
- Membership and role are resolved server-side for every protected request.
- Never accept integration credentials as user credentials.

- [ ] Add tests for missing/invalid workspace header, non-member, revoked membership, suspended workspace and viewer calling admin route.
- [ ] Add cross-workspace resource-ID substitution tests to incidents, alerts and security-events handlers that accept resource IDs.
- [ ] Run workspace and feature authorization suites.
- [ ] Repair only confirmed authorization gaps; do not weaken existing access checks.
- [ ] Run full API test, typecheck and security suites.
- [ ] Commit focused authorization changes.

**Backend release gate:** no iOS integration starts until Tasks 1–5 pass and a read-back review confirms no raw refresh token persistence, no silent account linking and no workspace bypass.

---

## Phase B — Native iOS client

### Task 6: Establish the iOS project and build baseline

**Files:**
- Create: `apps/ios/README.md`
- Create: `apps/ios/NexusShield.xcodeproj`
- Create: `apps/ios/NexusShield/App/NexusShieldApp.swift`
- Create: `apps/ios/NexusShieldTests/`

**Interfaces:**
- App composition root owns dependency construction.
- Build settings contain non-secret environment configuration only.
- Minimum iOS target and Xcode/Swift versions are fixed in the README after compatibility review.

- [ ] Confirm available macOS/Xcode environment and Apple Developer configuration.
- [ ] Pin Xcode and Swift versions and choose minimum iOS version.
- [ ] Create the app and unit-test targets with no backend secrets in build settings.
- [ ] Run a clean simulator build and an empty XCTest suite.
- [ ] Commit the minimal app shell and setup instructions.

### Task 7: Implement Keychain credential storage

**Files:**
- Create: `apps/ios/NexusShield/Core/Security/KeychainStore.swift`
- Create: `apps/ios/NexusShieldTests/Security/KeychainStoreTests.swift`

**Interfaces:**
- `save(_ data: Data, account: String) throws`
- `read(account: String) throws -> Data?`
- `delete(account: String) throws`
- Dedicated service namespace; app-only access group by default; accessibility class chosen to support documented session restoration.

- [ ] Write tests for save/read/delete, missing item, overwrite and Keychain error propagation.
- [ ] Run KeychainStore tests on simulator/device test target.
- [ ] Implement Security.framework wrapper without fallback to UserDefaults or files.
- [ ] Verify no credential values appear in logs.
- [ ] Commit Keychain store and tests.

### Task 8: Implement API client and typed errors

**Files:**
- Create: `apps/ios/NexusShield/Core/Networking/APIClient.swift`
- Create: `apps/ios/NexusShield/Core/Networking/APIError.swift`
- Create: `apps/ios/NexusShieldTests/Security/APIClientTests.swift`

**Interfaces:**
- `send<T: Decodable>(_ request: APIRequest, as: T.Type) async throws -> T`
- Inject base URL and URLSession for tests.
- Support Bearer authorization and optional workspace header.
- No automatic retry for writes; bounded timeout and cancellation.

- [ ] Write URLProtocol-backed tests for success decode, malformed JSON, 401, 403, 428, 429, 503, timeout and cancellation.
- [ ] Run APIClient tests.
- [ ] Implement transport and normalized errors while preserving server machine codes.
- [ ] Verify request/response logging redacts authorization and sensitive bodies.
- [ ] Commit networking foundation.

### Task 9: Implement TokenCoordinator single-flight refresh

**Files:**
- Create: `apps/ios/NexusShield/Core/Security/TokenCoordinator.swift`
- Create: `apps/ios/NexusShieldTests/Security/TokenCoordinatorTests.swift`

**Interfaces:**
- `validAccessToken() async throws -> String`
- `storeSession(_ session: AuthSession) async throws`
- `clearSession() async`
- Refresh transport consumes one refresh token and stores replacement credentials atomically.
- Concurrent callers await one refresh task; each failed protected request retries at most once.

- [ ] Write concurrency tests proving N simultaneous 401 responses trigger exactly one refresh call.
- [ ] Write tests for refresh failure, expired refresh, Keychain write failure and cancellation.
- [ ] Run TokenCoordinator tests.
- [ ] Implement actor-isolated coordinator and atomic local session replacement.
- [ ] Commit coordinator and tests.

### Task 10: Implement Apple sign-in and NEXUS auth repository

**Files:**
- Create: `apps/ios/NexusShield/Features/Authentication/AppleSignInService.swift`
- Create: `apps/ios/NexusShield/Features/Authentication/AuthRepository.swift`
- Create: `apps/ios/NexusShield/Domain/Session.swift`
- Create: `apps/ios/NexusShield/Domain/User.swift`
- Create: `apps/ios/NexusShieldTests/Security/AppleSignInServiceTests.swift`

**Interfaces:**
- `AppleSignInService.beginSignIn() async throws -> AppleCredential`
- `AuthRepository.signInWithApple(_ credential: AppleCredential) async throws -> AuthSession`
- `AuthRepository.logout() async throws`
- Nonce generated with cryptographically secure randomness; raw nonce retained only for the matching request and passed to backend as contract requires.

- [ ] Write tests for cancellation, missing identity token, nonce mismatch and backend rejection.
- [ ] Run authentication service tests.
- [ ] Implement AuthenticationServices bridge and backend exchange adapter.
- [ ] Store session only after full response validation; never persist partial credentials.
- [ ] Commit authentication repository and tests.

### Task 11: Add authentication UI and app session routing

**Files:**
- Create: `apps/ios/NexusShield/Features/Authentication/AuthenticationView.swift`
- Create: `apps/ios/NexusShield/Features/Authentication/AuthenticationViewModel.swift`
- Modify: `apps/ios/NexusShield/App/NexusShieldApp.swift`

**Interfaces:**
- ViewModel exposes explicit states: signedOut, signingIn, signedIn, restoring, failed.
- UI contains native Sign in with Apple control and safe error/cancel handling.

- [ ] Write ViewModel tests for restore, sign-in, cancellation, backend failure and logout.
- [ ] Run ViewModel tests.
- [ ] Implement SwiftUI screen and app routing.
- [ ] Verify no false signed-in state is shown before backend exchange succeeds.
- [ ] Commit authentication UI.

### Task 12: Implement workspace selection and scoped repository

**Files:**
- Create: `apps/ios/NexusShield/Domain/Workspace.swift`
- Create: `apps/ios/NexusShield/Features/Workspace/WorkspaceRepository.swift`
- Create: `apps/ios/NexusShield/Features/Workspace/WorkspaceView.swift`
- Create: `apps/ios/NexusShield/Features/Workspace/WorkspaceViewModel.swift`
- Create: `apps/ios/NexusShieldTests/Security/WorkspaceRepositoryTests.swift`

**Interfaces:**
- `WorkspaceRepository.listWorkspaces() async throws -> [Workspace]`
- `WorkspaceRepository.selectWorkspace(_ id: UUID) async throws`
- Selected workspace ID is client navigation context only.
- Every scoped request includes workspace header; server remains authorization authority.

- [ ] Write tests for workspace list decode, selection, 428, 403, revoked membership and cross-workspace stale selection.
- [ ] Run workspace repository tests.
- [ ] Implement repository and selection state; clear selection on access denial and reload list.
- [ ] Commit workspace feature foundation.

### Task 13: Biometric privacy gate and logout recovery

**Files:**
- Create: `apps/ios/NexusShield/Core/Security/BiometricGate.swift`
- Extend: `apps/ios/NexusShield/Features/Authentication/AuthRepository.swift`
- Extend: authentication and Keychain tests.

**Interfaces:**
- `BiometricGate.evaluate(reason: String) async throws -> Bool`
- Biometrics gate local re-entry/sensitive views only; it is not a server-auth replacement.
- Local logout clears Keychain and user/workspace cache even if remote revocation fails; UI records revocation as unconfirmed.

- [ ] Write tests for unavailable biometrics, user cancellation, enrollment change and remote logout failure.
- [ ] Run focused security tests on simulator and a physical device where available.
- [ ] Implement recoverable biometric gate and local logout fallback.
- [ ] Verify local credentials are removed on logout regardless of network state.
- [ ] Commit security gate.

---

## Phase C — Verification and review gates

### Task 14: End-to-end security and API contract verification

**Files:**
- Extend backend tests and iOS test targets only where evidence requires.
- Create: `docs/ios/IOS-SECURITY-TEST-RESULTS.md` after tests are actually run.

- [ ] Run backend auth, refresh, workspace and cross-workspace integration suites.
- [ ] Run iOS XCTest suite and simulator build on pinned macOS/Xcode runner.
- [ ] Verify Apple sandbox sign-in with configured Bundle ID and backend audience.
- [ ] Verify refresh rotation/replay, logout, logout-all and Keychain restore on device.
- [ ] Verify network traces contain no tokens or private Apple claims.
- [ ] Record exact commands, tool versions, commit SHA and pass/fail evidence; do not mark unrun tests as passed.

### Task 15: Whole-branch review and merge proposal

**Files:**
- Review all changed files; no additional code changes without review findings and user approval.

- [ ] Review database migration rollback/recovery and token-family invariants.
- [ ] Review Apple account-linking behavior and privacy disclosure.
- [ ] Review workspace authorization for every mobile-connected endpoint.
- [ ] Review iOS dependency graph, secret handling, logs and offline behavior.
- [ ] Confirm CI/security gates pass on the feature branch.
- [ ] Present a change summary and PR link for user review.
- [ ] Merge to `main` after all required CI/security gates pass under the user's explicit authorization; do not deploy.

## Execution notes

- Repository audit correction (2026-11-12): `main` already contains migrations 001–012, including `012_threat_intelligence_analytics.sql`. The Apple identity/refresh-session migration is therefore **013**, never 012. The CI migration-count and idempotency assertions must be updated from 12 to 13 in the same change.
- Refresh persistence is represented by `auth_refresh_token_families` plus `auth_refresh_tokens`: family rows bind one user to one existing access session; token rows store only SHA-256 hashes and a same-family parent reference. Raw refresh tokens are never persisted.

- Each task is independently reviewable and should be committed separately after its tests pass.
- Backend Phase A is a prerequisite for native login integration; Phase B may create isolated UI scaffolding only after the user approves the plan and macOS build environment is confirmed.
- Keep implementation in a feature branch based on a freshly fetched `main`; do not merge the documentation branch as an implementation shortcut.
- If a proposed path conflicts with the actual repository layout at execution time, stop and update the plan for review rather than forcing a refactor.
