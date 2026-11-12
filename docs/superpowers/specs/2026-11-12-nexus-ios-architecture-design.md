# NEXUS SHIELD AI — Native iOS Architecture v1.0

- Status: **Proposed — awaiting owner approval**
- Date: 2026-11-12
- Baseline: `main` at `a0d4c13bbb5951b27c0efc0380b5fb89c6e9fcfc`
- Decision: Native SwiftUI; Sign in with Apple + NEXUS authentication; Keychain-backed sessions.
- Scope: Architecture and API contract design only. No app scaffold, product code, database migration, or production configuration is authorized by this document.

## 1. Intent

Define a secure, maintainable native iOS client for NEXUS SHIELD AI that consumes the existing platform APIs without claiming unavailable backend capabilities. Establish explicit boundaries between implemented endpoints and proposed backend work before creating an Xcode project.

## 2. Goals

1. Deliver a native iPhone experience using SwiftUI and Swift Concurrency.
2. Reuse NEXUS identity, workspace, incident, alert, security-event, threat, privacy, and malware-scan capabilities where their current APIs support a user-facing client.
3. Keep access credentials out of ordinary preferences, logs, analytics, URLs, and source control.
4. Make workspace membership and authorization decisions exclusively on the server.
5. Specify Apple identity verification, NEXUS token exchange, refresh rotation, revocation, error handling, and API versioning.
6. Preserve existing web and Android applications and all current repository structure.

## 3. Non-goals

- Replacing or rewriting the web application or Android app.
- Porting all web pages before validating mobile API support.
- Implementing a backend, database migration, or iOS application in this architecture phase.
- Treating a UI screen, local cache, or AI-generated summary as proof of a live scan, protection action, threat feed, or incident.
- Embedding service tokens, provider API keys, Apple private keys, or other server secrets in the iOS binary.

## 4. Anti-goals

The implementation must not:
- Trust a workspace ID, role, entitlement, or user ID supplied by the client as authorization.
- Persist access or refresh tokens in UserDefaults, SwiftData, files, logs, crash reports, or analytics.
- accept an Apple identity token without server-side cryptographic and claim validation.
- silently link an Apple identity to an existing password account solely because email addresses match.
- retry non-idempotent writes automatically after an ambiguous network failure.
- show fabricated threat-map points, risk scores, scan outcomes, or protection status.

## 5. Approaches considered

### A. Native SwiftUI — selected

Native presentation, Apple AuthenticationServices, LocalAuthentication, Keychain Services, URLSession, and structured concurrency. Best fit for the explicit native iOS requirement and platform security integrations. Requires a macOS/Xcode build and signing environment.

### B. React Native / Expo

Could reuse parts of the existing mobile experiment, but adds a cross-platform runtime and does not meet the selected native SwiftUI direction. Existing PR #14 is not adopted as the iOS architecture baseline.

### C. WebView wrapper

Would reuse web UI quickly but provides weaker native integration and does not satisfy the intended native application architecture. Rejected.

## 6. Platform and architecture

- Minimum deployment target: **TBD during implementation planning** after confirming the intended supported iPhone/iOS range and current Xcode toolchain.
- Language/UI: Swift + SwiftUI.
- Concurrency: async/await, actors for mutable shared security/session state, cancellation-aware tasks.
- Networking: URLSession behind a typed API client; HTTPS only; fixed configured API origin; no arbitrary URL forwarding.
- Authentication: AuthenticationServices for Apple sign-in; NEXUS token exchange is a backend contract, not an existing endpoint.
- Local secrets: Keychain Services.
- Biometric unlock: LocalAuthentication gates local access to the stored session where appropriate; biometric success is not server authentication and must not extend token expiry.
- Non-secret cache: SwiftData or bounded file cache only for data explicitly approved for offline use; cache is workspace-scoped and cleared on sign-out/account switch.
- No secrets or credentials in app bundle, Info.plist, remote config, source control, or client-side environment files.

### 6.1 Module boundaries

```
NexusApp
  AppLifecycle / DependencyContainer / Configuration
  Presentation
    Navigation / DesignSystem / SharedComponents
  Domain
    Entities / UseCases / RepositoryProtocols
  Data
    APIClient / DTOs / RepositoryImplementations
  Core
    Security / Keychain / Session / Networking / Diagnostics
  Features
    Authentication / Workspace / Dashboard / Incidents / Alerts
    SecurityEvents / ThreatIntelligence / MalwareScans / Privacy
    AIInsights / Settings / Support (only when API support exists)
```

Feature modules depend on Domain protocols. Presentation depends on Domain use cases. Data implements repository protocols. Core Security is the only module allowed to read/write credentials. No View or ViewModel constructs raw bearer headers or accesses Keychain directly.

### 6.2 Request flow

```
SwiftUI View
  -> Feature ViewModel (@MainActor)
  -> Domain Use Case
  -> Repository Protocol
  -> API Repository
  -> Authenticated API Client
  -> Session Actor (access token / refresh coordination)
  -> URLSession
  -> NEXUS API
```

The API client attaches the active workspace header only for workspace-scoped requests. The server independently validates the authenticated user, workspace status, membership, role, and resource ownership.

## 7. Authentication and session design

### 7.1 Sign in with Apple

1. The user explicitly starts Sign in with Apple.
2. The app requests an Apple identity credential and generates a cryptographically random, single-use nonce.
3. The app sends the Apple identity token and nonce-bound transaction result to the NEXUS backend over HTTPS.
4. The backend validates the token signature using Apple's published keys and validates issuer, audience (the configured iOS bundle/service identifier), expiry, issued-at constraints, nonce, and required subject claims.
5. The backend resolves the Apple subject identifier to a NEXUS account using a stable provider identity record.
6. Account linking is explicit and verified. Email equality alone is not sufficient to merge accounts. Private relay addresses are accepted as valid Apple-provided contact addresses; they are not treated as proof that an existing account is the same person.
7. On success, the backend issues a NEXUS access token and refresh token pair under the contract in `NEXUS_IOS_API_CONTRACTS.md`.

The iOS app must never contain an Apple client secret or private signing key. Token validation is server-side.

### 7.2 Token lifecycle

- Access token: proposed 15-minute lifetime, consistent with the current API's existing 15-minute access-token lifetime.
- Refresh token: opaque, high-entropy, server-verifiable credential; proposed 30-day inactivity expiry and 90-day absolute lifetime, subject to security review and product policy.
- Rotation: each successful refresh invalidates the presented refresh token and returns a new refresh token. Store only a secure hash of refresh tokens server-side.
- Reuse detection: replay of a rotated/revoked refresh token revokes the associated token family and requires re-authentication; record a security audit event without logging token material.
- Concurrency: a single Session actor serializes refresh operations; simultaneous 401s await one refresh operation rather than racing.
- Revocation: sign-out revokes the current refresh-token family server-side, then clears local credentials. A failed revocation is surfaced; local credentials are still removed to prevent continued local use.
- Logout-all: use the existing endpoint where appropriate; revoke all refresh families as well as access sessions after backend support is added.
- On refresh failure, invalid grant, reuse detection, account disablement, or unrecoverable credential corruption, clear local session and require sign-in.
- Never persist a refresh token in UserDefaults or ordinary app storage.

### 7.3 Keychain policy

- Store access and refresh tokens in Keychain with device-only accessibility (prefer `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; evaluate background refresh needs before changing).
- Do not sync tokens through iCloud Keychain.
- Use a dedicated service/account namespace and versioned key names.
- Keychain access group is not shared by default; configure a shared group only if a documented extension requirement exists.
- Face ID / Touch ID may gate opening the app's local authenticated area using LocalAuthentication. Do not require biometrics on every network request and do not confuse local biometric unlock with server-side identity verification.
- On sign-out, account switch, refresh-family revocation, or account deletion, delete all relevant credentials and workspace-scoped cached data.
- Redact Authorization headers, identity tokens, refresh tokens, cookies, and personal data from diagnostics.

## 8. Workspace isolation

- The app obtains the user's available workspaces from the authenticated workspace-list endpoint.
- The selected workspace ID is a request selector, not an authorization grant.
- For every workspace-scoped operation the server must validate active user, active workspace, active membership, role, and resource ownership.
- Client sends `X-NEXUS-WORKSPACE-ID` only where required by the API.
- A workspace ID in a body, path, query, or header must never bypass server membership checks.
- The app must not use workspace integration tokens. Those are server-to-server credentials and remain outside the mobile client.
- On workspace switch, cancel outstanding requests, invalidate workspace-bound view state, and reload data under the newly selected workspace.
- On 403/WORKSPACE_ACCESS_DENIED, clear the selected workspace and refresh the workspace list; never fall back to another workspace implicitly.

## 9. API integration strategy

The current API uses unversioned `/api` paths. The first iOS release may use those paths behind a typed client, but the backend should introduce a versioned mobile contract (recommended `/api/v1`) before long-term external mobile releases. Versioning must be additive and must not break web/Android clients.

Existing API endpoints are enumerated in `NEXUS_IOS_API_CONTRACTS.md`. Apple exchange and refresh-token rotation are proposed contracts, not existing routes.

## 10. Error, pagination, and write semantics

- Normalize errors into `code`, safe user-facing `message`, optional field errors, and `request_id`.
- Never expose stack traces, SQL, provider secrets, token values, or internal infrastructure details to the client.
- Distinguish unauthenticated (401), forbidden (403), workspace required (428), rate limited (429), validation failure (400), conflict (409), and service unavailable (503).
- Use cursor pagination for potentially unbounded event, incident, and alert lists; stable ordering and opaque cursors are required before implementing infinite scrolling.
- Support `Idempotency-Key` for client-initiated operations that may be retried; server must bind key to authenticated user/workspace and request fingerprint.
- GET requests may be retried with bounded backoff. Mutations are not retried automatically unless idempotency is guaranteed.
- Use `Cache-Control: no-store` for authentication responses and sensitive account/session data.

## 11. Offline and local data

- Offline mode is read-only and explicitly labeled with the last successful synchronization time.
- Never queue security actions, account changes, workspace membership changes, or scan requests for later silent execution.
- Cached objects are partitioned by account and workspace, bounded by TTL, and removed on logout or access revocation.
- A stale cache must never be presented as live threat telemetry or active protection status.

## 12. Push notifications

APNs is a later phase. No device-registration endpoint was verified in the current API. Before implementation, define device-token registration, account/workspace binding, token rotation, notification preferences, logout/de-registration, and privacy-safe payload rules. Push payloads must not contain sensitive incident details or authentication material.

## 13. Privacy, App Store, and release considerations

- Provide clear privacy disclosures for account identifiers, diagnostics, device tokens, and security telemetry actually collected.
- Request permissions only at the point of need and explain their purpose.
- Provide account deletion and data-rights flows only when backed by verified server processes.
- Use Sign in with Apple according to Apple's current entitlement, UI, and review requirements; validate the final design against current Apple documentation during implementation.
- No statement in this design guarantees App Store approval.
- Release requires a macOS/Xcode environment for signing, archive, device testing, and App Store submission. The user can review repository changes from Android, but a phone alone cannot perform the complete native iOS release toolchain.

## 14. Current-state evidence and gaps

Verified from `main` at the baseline SHA above:
- Express API mounts `authRouter` and `workspacesRouter` under `/api`.
- `POST /api/auth/login` currently accepts email/password and issues a 15-minute JWT.
- `GET /api/auth/me`, `POST /api/auth/logout`, and `POST /api/auth/logout-all` exist.
- JWT validation checks issuer, audience, algorithm, expiry, session ID, active server session, and current user state.
- PostgreSQL `auth_sessions` supports expiry and revocation; it is not a refresh-token family store.
- Workspace middleware requires an authenticated user and `X-NEXUS-WORKSPACE-ID`, then checks active membership server-side.
- Workspace integration tokens are distinct server-to-server credentials.
- Web login currently forwards email/password to the API; it does not implement Apple exchange.

Not verified / missing for native iOS:
1. Apple identity-token exchange endpoint and provider identity table.
2. Refresh endpoint, refresh-token storage/hash, rotation, reuse detection, family revocation.
3. Mobile-compatible account linking and recovery policy.
4. Stable versioned API contract, cursor pagination guarantees, and idempotency support across write endpoints.
5. APNs device registration and notification preferences.
6. iOS-specific build, signing, entitlements, privacy manifests, and CI validation.

## 15. Acceptance criteria for this design

- Native SwiftUI, Apple sign-in, and Keychain-backed session decisions are explicitly fixed.
- Existing API capabilities and proposed API additions are distinguished.
- Apple token validation is server-side and includes signature, issuer, audience, expiry, and nonce.
- Refresh rotation, reuse detection, and revocation semantics are defined.
- Workspace isolation relies on backend membership and resource authorization.
- No client-side service credential or provider secret is permitted.
- No implementation or merge to `main` occurs before separate approval.

## 16. Open decisions for implementation planning

- Minimum supported iOS version and Xcode/Swift toolchain.
- Production API base URL and certificate/pinning policy (pinning requires an operational rotation plan).
- Final refresh-token lifetime and risk policy.
- Apple Developer Team, Bundle ID, Sign in with Apple capability, and private relay configuration.
- Which features are in the first iOS release versus later releases.
- Whether background refresh is required; this affects Keychain accessibility and APNs design.
