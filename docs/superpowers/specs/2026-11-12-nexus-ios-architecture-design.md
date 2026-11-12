# NEXUS iOS Architecture v1.0 — Design Specification

- Date: 2026-11-12
- Repository baseline: `main` at `a0d4c13bbb5951b27c0efc0380b5fb89c6e9fcfc`
- Status: Draft for user review; no application code or backend changes authorized
- Target branch: `docs/ios-architecture-v1`

## 1. Intent

Define a native iOS architecture and stable client/backend boundaries for NEXUS SHIELD AI before creating the Xcode project. This document distinguishes verified current repository behavior from proposed backend work. It is not evidence that any proposed endpoint or feature is implemented or deployed.

## 2. Goals

1. Native iOS application using SwiftUI, Swift Concurrency, modular MVVM and Clean Architecture boundaries.
2. Sign in with Apple, with Apple identity tokens validated by NEXUS API servers.
3. Native session handling using Keychain and short-lived access tokens plus rotating refresh tokens.
4. Workspace isolation enforced by backend membership and role checks on every protected operation.
5. Testable networking, explicit error states, safe local caching and incremental feature delivery.
6. Preserve existing repository structure and backend contracts; no destructive refactors.

## 3. Non-goals and anti-goals

- No SwiftUI screens, Xcode project scaffolding, backend code, database migrations or deployment in this phase.
- No WebView wrapper as the primary iOS application.
- No secrets, Apple private keys, API provider keys or integration credentials embedded in the app.
- No client-side-only authorization and no trust in a workspace identifier supplied by the device.
- No invented live threat intelligence, scan outcomes, SOC telemetry or AI scores.
- No claim of App Store approval or security certification.

## 4. Approaches considered

### Selected: Native SwiftUI

Best fit for native Apple authentication, Keychain, LocalAuthentication, platform lifecycle, accessibility and long-term iOS-specific capabilities.

### Not selected: React Native / Expo

Could reuse some cross-platform UI concepts, but the selected product direction is a dedicated native iOS client. Existing Android code remains separate; this decision does not authorize rewriting Android.

### Not selected: WebView hybrid

Would preserve web UI reuse but weakens native interaction and security-boundary clarity for the chosen product.

## 5. Architecture and module boundaries

Use feature-oriented modules with dependency direction:

- App: lifecycle, composition root, dependency injection, environment configuration.
- Presentation: SwiftUI views, observable view models, navigation and view state.
- Domain: entities, use cases and repository protocols; no SwiftUI, URLSession or persistence dependencies.
- Data: DTOs, API clients, repository implementations, mapping and cache adapters.
- CoreNetworking: URLSession transport, request construction, response decoding, API versioning and retry policy.
- CoreSecurity: Keychain access, token/session coordinator, Apple sign-in nonce handling, biometric gate and secure logging.
- Features: Authentication, Workspace, Dashboard, Scanner, Threat Intelligence, SOC, AI Assistant, Privacy, Settings and Support.

Use Swift Concurrency with actor isolation for shared mutable session state. Keep access-token refresh single-flight so parallel 401 responses do not trigger concurrent refresh-token rotations.

Local persistence: Keychain for credentials; SwiftData or file-backed storage only for explicitly classified non-secret cache data. Cache records must be scoped by user and workspace and purged on logout/account switch as appropriate.

## 6. Verified current backend surface

Repository source at the baseline confirms:

### Authentication

- `POST /api/auth/login`: email/password login. Returns `access_token`, `token_type: Bearer`, `expires_in: 900`, and a user object. The server persists a session before issuing the token.
- `GET /api/auth/me`: requires Bearer access token and returns the authenticated user.
- `POST /api/auth/logout`: revokes the current server-side session.
- `POST /api/auth/logout-all`: revokes all sessions for the authenticated user.
- Access JWT lifetime is 15 minutes; server-side session lookup is performed by auth middleware.
- No refresh-token endpoint or refresh-token rotation implementation was found in the inspected auth routes.

The web app's Next.js proxy stores the access token in an HttpOnly cookie. This is a web-specific transport and is not the native iOS storage contract.

### Workspace

- `GET /api/workspaces`: lists active workspaces for the authenticated user.
- `POST /api/workspaces`: creates a workspace for the authenticated user.
- `GET /api/workspaces/members`: requires an authenticated user, workspace context and admin role.
- `POST /api/workspaces/members`: same authorization boundary; adds an active existing user by email and role.
- `POST /api/workspaces/integrations`: admin-only integration creation with explicit permissions.
- `DELETE /api/workspaces/integrations/:integrationId`: admin-only integration revocation.
- Workspace context is currently supplied by `X-NEXUS-WORKSPACE-ID`. The backend validates UUID syntax and independently checks active membership before attaching workspace context to the request.
- Workspace roles in the current middleware: `admin`, `analyst`, `viewer`.
- Integration credentials are separate machine credentials and must not be used as end-user mobile credentials.

Other existing route families include incidents, alerts, security events, threats, threat intelligence, malware scans, privacy, attack paths, assets and reputation. Exact request/response DTOs and authorization rules for each feature must be captured from their route implementations before those features are wired into iOS.

## 7. Proposed native authentication contract

These are NEW backend contracts, not current endpoints:

### `POST /api/auth/apple`

Request:
- `identity_token`: Apple identity token string.
- `nonce`: original raw nonce associated with the sign-in request.
- Optional authorization-code field only if the backend has a defined server-side code-exchange requirement.

Server requirements:
- Verify token signature against Apple's published signing keys.
- Validate issuer, expected app audience/client ID, expiry, issued-at policy and nonce hash.
- Reject replay, malformed claims and mismatched audience.
- Resolve Apple subject as the stable external identity key.
- Do not use email as the sole account-linking key.
- Account linking to an existing NEXUS account requires a verified, explicit policy; never silently merge accounts solely because email strings match.
- Handle Apple's private relay email as an address, not as proof that two separate identities are the same person.
- Store only necessary identity attributes and record consent/identity-provider metadata.
- Return NEXUS access token, refresh token, expiry metadata and a minimal user profile; no Apple private key or client secret is ever shipped to the app.

### `POST /api/auth/refresh`

Request: refresh token.

Success: new access token and a new refresh token, expiry metadata and token type.

Security:
- Store only a cryptographic hash of refresh tokens server-side.
- Rotate on every successful refresh and atomically invalidate the predecessor.
- Detect predecessor reuse and revoke the affected token family/session.
- Bind tokens to a session/device record without treating device identifiers as authentication.
- Rate-limit and audit refresh failures; use generic public errors.

### Logout

- Keep current `POST /api/auth/logout` semantics, extending it to revoke the refresh-token family/session.
- Keep `POST /api/auth/logout-all` for all user sessions.
- Revoke on suspected refresh-token reuse, account security events and administrative action.

### Token lifetimes

- Access token: 15 minutes initially, matching the existing server policy.
- Refresh token: configurable server-side lifetime, proposed 30-day inactivity limit with absolute lifetime and rotation policy to be finalized during backend design.
- Do not hardcode server lifetime assumptions into the client; honor response expiry metadata.

## 8. Keychain and local authentication

- Store access and refresh tokens in Keychain; never UserDefaults, plain files, analytics, crash reports or logs.
- Use a dedicated service/account namespace and explicit accessibility class appropriate to the session restore requirement.
- Consider access group only if a separately authorized extension requires shared credentials; default is app-only access.
- Face ID / Touch ID is a local privacy gate for app re-entry or sensitive views, not a substitute for server authentication and not a per-request network challenge.
- Biometric enrollment changes and Keychain access failures must produce a recoverable re-authentication path.
- Logout clears local credentials and user/workspace-scoped cache even if the API is temporarily unavailable; UI must distinguish local credential clearing from confirmed server revocation.

## 9. Workspace authorization contract

Current behavior already requires `X-NEXUS-WORKSPACE-ID` on workspace-protected routes and validates active membership on the server.

Native client rules:
1. Fetch available workspaces from `GET /api/workspaces`.
2. User selects a workspace; client stores the selected ID only as navigation context, not as proof of access.
3. Send `X-NEXUS-WORKSPACE-ID` only where the endpoint requires workspace context.
4. Backend must re-check active membership and role on every request; never trust a client-supplied ID or cached role.
5. On 403/WORKSPACE_ACCESS_DENIED, clear the selected workspace and refresh the workspace list.
6. Never use `X-NEXUS-INTEGRATION-TOKEN` for interactive user sessions.
7. Every list/detail/mutation query must be scoped to the authenticated user and authorized workspace; test cross-workspace ID substitution.

The mobile app should not expose integration-token creation or privileged administration unless the backend policy and product requirements explicitly permit it.

## 10. Networking and API conventions

- HTTPS only; reject invalid TLS and do not implement permissive certificate bypass.
- JSON request/response contracts with explicit DTO versioning.
- Add `/api/v1` only as a separately reviewed backend migration; current routes are unversioned and must not be silently renamed.
- Standard headers: `Authorization: Bearer <access_token>`, `Accept: application/json`, `Content-Type: application/json`; workspace header only for scoped endpoints.
- Do not automatically retry non-idempotent writes. Use an idempotency key for operations where duplicate submission could create duplicate work, after backend support is defined.
- Pagination contract to standardize before large feeds are integrated: opaque cursor, page size limit, stable ordering, `next_cursor` and `has_more`. Existing route-specific pagination must be documented rather than assumed to match.
- Use bounded timeouts, cancellation propagation and request correlation IDs. Do not log tokens, passwords, Apple identity tokens, private user data or raw sensitive payloads.

## 11. Error model

Proposed normalized client error categories:
- `unauthenticated` (401): attempt one coordinated refresh; if refresh fails, clear local session and require sign-in.
- `forbidden` (403): show permission denial; do not retry automatically.
- `workspace_required` (428): prompt workspace selection.
- `workspace_access_denied` (403): invalidate selected workspace and reload memberships.
- `validation` (400/422): show field-level feedback where safe.
- `rate_limited` (429): honor Retry-After if present.
- `service_unavailable` (503) and transport failures: preserve session, show retry state.
- Unknown server errors: safe generic message plus correlation ID; never expose stack traces.

The backend's existing error codes remain authoritative. The client must not assume every endpoint already returns this proposed normalized model.

## 12. Offline and cache behavior

- Offline mode is read-only unless a feature receives an explicitly designed, conflict-safe queued-write contract.
- Cache only data needed for a clear user benefit; apply TTL and workspace scoping.
- Do not cache authentication tokens in the data cache.
- Purge workspace-scoped cache on workspace switch and user data on logout/account switch, subject to any explicit legal-retention requirement.
- Display cached data with its last-updated timestamp and never label stale information as live.

## 13. Notifications and future capabilities

APNs device registration is not confirmed in the current backend. Add later through a dedicated authenticated device-registration contract with device-token rotation, logout removal, notification preferences and server-side ownership checks. Push payloads must not contain sensitive incident details or secrets.

Subscriptions, support tickets and other absent API surfaces remain gap items until verified and designed.

## 14. Privacy, App Store and platform review

- Request only permissions required by a user-visible feature and explain their purpose before the system prompt.
- Provide privacy disclosures consistent with actual collection, retention, analytics and third-party processing.
- Support account deletion and privacy-request workflows only to the extent the backend can complete and verify them.
- Use Sign in with Apple where applicable to the app's account model and review obligations; confirm current Apple rules during implementation.
- Do not claim App Store approval, regulatory compliance or MASVS verification from architecture documentation alone.

## 15. Explicit gaps and decisions

1. Implement Apple identity verification and secure account-linking policy on backend.
2. Implement refresh-token storage, rotation, reuse detection, revocation and tests.
3. Define mobile session/device lifecycle and token-family schema.
4. Verify endpoint DTOs, workspace requirements and role matrix for every mobile feature.
5. Add APNs device registration and notification preferences when push scope is approved.
6. Define subscription and support APIs if those features are included in iOS v1.
7. Decide refresh-token absolute lifetime, inactivity lifetime and re-authentication thresholds.
8. Confirm bundle ID, Apple Services ID/audience, associated domains and Apple Developer account configuration before implementation.
9. Confirm minimum iOS deployment target and Xcode/Swift toolchain during implementation planning.

## 16. Acceptance criteria for this design

- Architecture and module boundaries are approved.
- Current APIs are separated from proposed APIs with no invented implementation claims.
- Apple token verification and account-linking requirements are explicit.
- Refresh-token rotation and reuse-detection behavior is explicit.
- Keychain responsibilities and biometric boundaries are explicit.
- Workspace membership and role checks remain server-authoritative.
- Error, pagination, caching, offline and notification policies are documented.
- Gaps and implementation prerequisites are visible.
- No product code, backend code, migration, deployment or main-branch change is included.

## 17. Next phase after approval

After this design is approved, prepare the detailed API contract and implementation plan as separate reviewable documents. The implementation plan will identify exact file paths, interfaces, backend migrations, tests, CI gates and a staged delivery sequence. No implementation begins until that plan is separately reviewed and approved.
