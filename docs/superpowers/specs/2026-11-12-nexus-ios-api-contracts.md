# NEXUS iOS API Contracts v1.0

- Date: 2026-11-12
- Design: `docs/superpowers/specs/2026-11-12-nexus-ios-architecture-design.md`
- Baseline: `main` at `a0d4c13bbb5951b27c0efc0380b5fb89c6e9fcfc`
- Status: Proposed contract for review; proposed endpoints are not implemented unless explicitly marked current.
- Target branch: `docs/ios-architecture-v1`

## 1. Contract conventions

- API origin is environment-configured; route paths below include the current `/api` prefix.
- JSON over HTTPS; UTF-8; `Cache-Control: no-store` for authentication and private identity responses.
- Authenticated requests use `Authorization: Bearer <access_token>`.
- Workspace-scoped requests use `X-NEXUS-WORKSPACE-ID: <uuid>`; this is a selector, never an authorization grant.
- Do not send integration tokens from the native user session.
- Timestamps use RFC 3339 UTC strings.
- IDs are opaque UUID strings unless a current route documents otherwise.
- Unknown response fields should be ignored by the client; required fields and enum values are versioned deliberately.
- No API secrets, Apple private keys or provider keys are embedded in the app.

## 2. Authentication endpoints

### 2.1 Current: `POST /api/auth/login`

Purpose: existing email/password login.

Request:
```json
{ "email": "user@example.com", "password": "..." }
```

Success (200; current route shape):
```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": { "id": "<uuid>", "email": "user@example.com", "role": "user" }
}
```

Errors observed in route: 400 `INVALID_REQUEST`; 401 `INVALID_CREDENTIALS`; 503 `AUTH_NOT_CONFIGURED` or `AUTH_STORE_UNAVAILABLE`.

iOS v1 decision: do not expose email/password UI in the first native auth release unless product explicitly asks for it; Apple sign-in is the selected primary provider.

### 2.2 Current: `GET /api/auth/me`

Request: Bearer access token.

Success (200):
```json
{ "user": { "id": "<uuid>", "email": "user@example.com", "role": "user" } }
```

Errors: 401 `UNAUTHENTICATED` or `INVALID_ACCESS_TOKEN`; 503 `AUTH_NOT_CONFIGURED` or `AUTH_SESSION_STORE_UNAVAILABLE`.

### 2.3 Current: `POST /api/auth/logout`

Request: Bearer access token; no body required.

Success (200): `{ "success": true }`.

Current behavior revokes the server-side session associated with the access token. Proposed extension: also revoke the associated refresh-token family.

### 2.4 Current: `POST /api/auth/logout-all`

Request: Bearer access token; no body required.

Success (200): `{ "success": true, "revoked_sessions": <integer> }`.

Current behavior revokes all sessions for the authenticated user. Proposed extension: revoke all refresh-token families.

### 2.5 Proposed: `POST /api/auth/apple`

Not present in the inspected backend at the baseline.

Request:
```json
{
  "identity_token": "<Apple identity JWT>",
  "nonce": "<raw nonce generated for this authorization request>",
  "authorization_code": "<optional; only if server-side code exchange is adopted>"
}
```

Success (200):
```json
{
  "access_token": "<NEXUS access token>",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "<opaque one-time refresh credential>",
  "refresh_expires_in": 2592000,
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "role": "user",
    "display_name": null
  },
  "session": { "id": "<uuid>" }
}
```

Contract notes:
- Server validates Apple signature using Apple's published keys; issuer; exact configured audience; expiry and issued-at policy; nonce; subject.
- Client sends raw nonce used to create the Apple request; server compares it with the nonce claim according to Apple's token format.
- `authorization_code` remains optional and must not be sent until server-side code exchange and its storage/rotation obligations are specified.
- Stable identity key is Apple `sub`, scoped to the configured app/team identity.
- Email is profile/contact data, not a sole account-linking key.
- Existing-account linking must require an authenticated, explicit linking flow or another verified account-recovery process. Never silently merge on email equality.
- Private relay addresses are valid contact addresses and must not be treated as identity equivalence.
- Return generic public errors: 400 `INVALID_APPLE_CREDENTIAL`; 401 `APPLE_IDENTITY_REJECTED`; 409 `ACCOUNT_LINK_REQUIRED`; 429 `RATE_LIMITED`; 503 `AUTH_PROVIDER_UNAVAILABLE`.
- Do not reveal whether a specific email already has an account.

### 2.6 Proposed: `POST /api/auth/refresh`

Not present in the inspected backend at the baseline.

Request:
```json
{ "refresh_token": "<opaque refresh credential>" }
```

Success (200):
```json
{
  "access_token": "<new NEXUS access JWT>",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "<new opaque refresh credential>",
  "refresh_expires_in": 2592000
}
```

Rules:
- Rotate refresh token atomically on every successful call; predecessor becomes unusable.
- Persist only a cryptographic hash of the refresh token.
- Refresh token is single-use. Reuse of a rotated token revokes the token family/session and emits an auditable security event.
- Return generic 401 `INVALID_REFRESH_TOKEN` for expired, revoked, malformed or unknown credentials. Do not disclose which condition occurred.
- 429 `RATE_LIMITED`; 503 `AUTH_SESSION_STORE_UNAVAILABLE`.
- Proposed default inactivity lifetime: 30 days; absolute lifetime and reauthentication thresholds must be decided before implementation. Client must honor server-provided expiry metadata rather than hardcoding 30 days.

### 2.7 Proposed: `POST /api/auth/apple/link`

Optional later capability; not part of initial Apple sign-in unless account-linking UX is explicitly required.

Requires existing NEXUS Bearer access token plus a fresh Apple identity token and nonce. Server binds verified Apple `sub` to the authenticated NEXUS user only after recent reauthentication and conflict checks. A provider identity already bound to another account returns generic 409 `IDENTITY_ALREADY_LINKED`.

## 3. Workspace endpoints

### 3.1 Current: `GET /api/workspaces`

Requires Bearer access token. No workspace header required.

Success (200):
```json
{
  "workspaces": [
    { "id": "<uuid>", "name": "Workspace", "slug": "workspace-a1b2c3d4", "role": "admin" }
  ]
}
```

The response is the user's active workspace membership list. Do not assume this includes suspended or revoked memberships.

### 3.2 Current: `POST /api/workspaces`

Requires Bearer access token.

Request:
```json
{ "name": "My Workspace" }
```

Success (201): `{ "workspace": { "id": "<uuid>", "name": "...", "slug": "...", "role": "admin" } }`.

### 3.3 Current: `GET /api/workspaces/members`

Requires Bearer access token, `X-NEXUS-WORKSPACE-ID`, and workspace role `admin`.

Success (200): `{ "members": [{ "id": "<uuid>", "email": "...", "role": "viewer", "status": "active", "createdAt": "<RFC3339>" }] }`.

### 3.4 Current: `POST /api/workspaces/members`

Requires Bearer access token, workspace header, role `admin`.

Request:
```json
{ "email": "member@example.com", "role": "analyst" }
```

Role enum currently accepted: `admin`, `analyst`, `viewer`.

Success (200): `{ "member": { "id": "<uuid>", "email": "...", "role": "analyst", "status": "active", "createdAt": "<RFC3339>" } }`.

### 3.5 Current: `POST /api/workspaces/integrations`

Requires Bearer access token, workspace header and role `admin`.

Request:
```json
{ "name": "SIEM Connector", "permissions": ["assets:read", "events:write"] }
```

Success (201): returns an integration object and a newly generated integration token. This is a machine credential. Native v1 should not expose or persist it as an ordinary user access token.

### 3.6 Current: `DELETE /api/workspaces/integrations/:integrationId`

Requires Bearer access token, workspace header and role `admin`.

Success (200): `{ "success": true }`; 404 `INTEGRATION_NOT_FOUND` when no active integration in the selected workspace matches.

### 3.7 Workspace authorization invariants

- Server derives user identity from verified Bearer session.
- Server validates the supplied workspace UUID and looks up active membership for that user on every protected request.
- Role authorization is server-side and endpoint-specific.
- Missing workspace context currently returns 428 `WORKSPACE_REQUIRED`; invalid UUID returns 400 `INVALID_WORKSPACE_ID`; non-member returns 403 `WORKSPACE_ACCESS_DENIED`.
- A client must clear its selected workspace on access denial and reload `GET /api/workspaces`.
- Resource APIs must scope both reads and writes by the authorized workspace, not merely validate the header at a gateway.
- Cross-workspace object-ID substitution must return no data (prefer 404 for inaccessible object IDs where disclosure itself is sensitive).

## 4. Common response and transport rules

### Success
- Preserve current route response envelopes (`user`, `workspaces`, `workspace`, `members`, etc.).
- Add `Cache-Control: no-store` for authentication and sensitive identity endpoints.
- Avoid changing existing field names without a versioned compatibility plan.

### Error envelope proposal for new endpoints
```json
{
  "error": "STABLE_MACHINE_CODE",
  "message": "Safe user-facing summary",
  "request_id": "<opaque correlation id>"
}
```

Existing endpoints have route-specific envelopes; the iOS decoder must tolerate missing optional `message` and `request_id` fields.

### Status handling
- 400/422: validation; do not retry.
- 401: for authenticated requests, coordinate one refresh attempt; if refresh fails, clear local session and require sign-in.
- 403: authorization denial; do not refresh or retry.
- 404: missing resource or intentionally concealed cross-workspace resource.
- 428: workspace selection required.
- 429: honor `Retry-After` when supplied.
- 5xx / transport failure: preserve valid local session; show recoverable error.
- Never display raw server exception text.

## 5. Refresh concurrency and idempotency

- Client TokenCoordinator exposes `validAccessToken() async throws -> String` and serializes refresh operations.
- Requests that receive 401 may await the same in-flight refresh task once; they must not independently submit the same refresh token.
- A retried request is attempted at most once after refresh.
- Do not retry writes after timeout unless endpoint supports an idempotency key.
- For new non-idempotent endpoints, define `Idempotency-Key` semantics (scope, retention window, request-body hash, replay response) before client adoption. This header is not assumed to work on current endpoints.

## 6. Pagination contract to standardize

Existing feature endpoints may use route-specific pagination. Do not assume this proposal already exists.

Proposed cursor envelope:
```json
{
  "items": [],
  "page": { "next_cursor": null, "has_more": false, "limit": 50 }
}
```

- Opaque server-generated cursor.
- Stable sort with a unique tie-breaker.
- Server-enforced maximum limit of 100; client default 50.
- Cursor bound to authenticated user, workspace and filter set.
- Invalid/expired cursor returns 400 `INVALID_CURSOR`.
- Each feature adapter must document its actual current pagination before integration.

## 7. Feature API inventory and integration gates

The repository includes route families for incidents, alerts, security events, threats, threat intelligence, malware scans, privacy requests, attack paths and assets. Their exact DTOs, pagination and user-vs-integration authorization must be inspected per route before adding native clients.

Specific known gate:
- Link scanning and asset inventory have service/integration credential boundaries in the audited design. Do not expose them as user endpoints until a user-session route with workspace-scoped authorization is implemented and tested.

Not confirmed at this baseline:
- APNs device registration.
- Subscription/billing endpoints.
- Support-ticket endpoints.
- Apple sign-in exchange.
- Refresh-token rotation endpoint.

## 8. Contract acceptance tests

Backend:
1. Apple token with invalid signature, issuer, audience, nonce or expiry is rejected.
2. Account with same email but unrelated Apple `sub` is not silently linked.
3. Valid Apple identity creates or resolves one stable NEXUS identity.
4. Refresh rotates token atomically; old token fails after rotation.
5. Reuse of old refresh token revokes its family and emits an audit event.
6. Logout revokes current refresh family; logout-all revokes all user families.
7. Workspace member can access only active workspaces they belong to.
8. Viewer cannot invoke admin-only workspace routes.
9. Workspace ID substitution cannot read or mutate another workspace's records.
10. Integration credentials are rejected by user-auth endpoints and user access tokens are not treated as integration credentials.

iOS:
1. Apple cancellation creates no NEXUS session.
2. Invalid server response never writes partial credentials to Keychain.
3. Concurrent 401 responses cause exactly one refresh request.
4. Refresh failure clears local credentials and returns to sign-in.
5. Workspace access denial clears selected workspace but does not silently switch user accounts.
6. Logout clears local tokens even if server revocation is unavailable, while reporting server revocation as unconfirmed.
7. Sensitive values never appear in logs or analytics.

## 9. Open decisions before implementation

- Apple Bundle ID, Team ID, Services ID/audience and developer account setup.
- Whether authorization code exchange is required in addition to identity-token verification.
- Explicit account-linking and account-recovery UX.
- Refresh absolute lifetime, inactivity lifetime and step-up reauthentication thresholds.
- Minimum supported iOS version, Xcode and Swift toolchain.
- API versioning strategy; current routes are unversioned.
- Exact per-feature DTOs and pagination after route-by-route source review.
- APNs, subscription and support scope for a later release.
