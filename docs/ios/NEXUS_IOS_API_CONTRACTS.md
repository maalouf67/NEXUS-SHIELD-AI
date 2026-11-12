# NEXUS SHIELD AI — iOS API Contracts v1.0

- Status: **Proposed — awaiting owner approval**
- Date: 2026-11-12
- Backend baseline: `main` at `a0d4c13bbb5951b27c0efc0380b5fb89c6e9fcfc`
- Important: Existing routes below were confirmed from source. Proposed routes are explicitly marked **PROPOSED** and are not implemented.

## 1. Contract conventions

- Base path today: `/api` (unversioned).
- Recommended future base path: `/api/v1`; introduce additively and preserve existing web/Android paths.
- Transport: HTTPS only in production; JSON request/response.
- Authentication: `Authorization: Bearer <NEXUS access token>` for protected user routes.
- Workspace context: `X-NEXUS-WORKSPACE-ID: <UUID>` for workspace-scoped routes; the server must validate membership on every request.
- Sensitive responses: `Cache-Control: no-store`.
- The mobile app must not send `X-NEXUS-INTEGRATION-TOKEN`; integration credentials are server-to-server only.
- UUIDs are canonical UUID strings. Timestamps are ISO-8601 UTC.
- Unknown response fields should be ignored by the client for forward compatibility.

## 2. Existing authentication endpoints — verified

### POST /api/auth/login

**Purpose:** Existing email/password login. Not the selected iOS Apple flow.

Request:
```json
{ "email": "user@example.com", "password": "not-shown" }
```

Success (200; representative shape from implementation):
```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": { "id": "<uuid>", "email": "user@example.com", "role": "admin" }
}
```

Observed errors include `INVALID_REQUEST`, `INVALID_CREDENTIALS`, `AUTH_NOT_CONFIGURED`, and `AUTH_STORE_UNAVAILABLE`.

### GET /api/auth/me

**Purpose:** Validate current bearer session and return current user.

Auth: required.

Success (200):
```json
{ "user": { "id": "<uuid>", "email": "user@example.com", "role": "admin" } }
```

Observed errors: `UNAUTHENTICATED`, `INVALID_ACCESS_TOKEN`, `AUTH_SESSION_STORE_UNAVAILABLE`.

### POST /api/auth/logout

**Purpose:** Revoke current access session.

Auth: required.

Success (200):
```json
{ "success": true }
```

### POST /api/auth/logout-all

**Purpose:** Revoke all active sessions for the current user.

Auth: required.

Success (200):
```json
{ "success": true, "revoked_sessions": 2 }
```

### POST /api/auth/users/{userId}/sessions/revoke-all

**Purpose:** Admin-only revocation of all sessions for a target user. This is not a normal end-user mobile action.

Auth: required; global role `admin`.

## 3. Existing workspace endpoints — verified route family

The Express API mounts `workspacesRouter` under `/api`. Workspace middleware confirms these semantics:
- Authenticated user required.
- Workspace-scoped requests require `X-NEXUS-WORKSPACE-ID`.
- Header value must be a UUID.
- Membership must be active in an active workspace.
- Missing workspace returns 428 `WORKSPACE_REQUIRED`.
- Invalid ID returns 400 `INVALID_WORKSPACE_ID`.
- No membership returns 403 `WORKSPACE_ACCESS_DENIED`.
- Workspace store failure returns 503 `WORKSPACE_ACCESS_UNAVAILABLE`.

The workspace repository confirms the available membership roles: `admin`, `analyst`, `viewer`; workspace states: `active`, `suspended`, `closed`.

### GET /api/workspaces

List active workspaces for the authenticated user. Response item shape:
```json
{ "id": "<uuid>", "name": "Operations", "slug": "operations", "role": "admin" }
```

### Workspace-scoped resources

The current codebase mounts routes for incidents, alerts, security events, asset inventory, threats, threat intelligence, privacy requests, malware scans, and related features. Before each feature is added to the iOS app, its exact route, DTO, pagination, and role policy must be confirmed from its route and repository implementation. Do not infer an endpoint from a web screen name.

Workspace integration endpoints and tokens are intended for integrations, not native mobile clients.

## 4. Proposed Apple identity exchange — NOT IMPLEMENTED

### POST /api/v1/auth/apple

Request:
```json
{
  "identity_token": "<Apple identity JWT>",
  "authorization_code": "<single-use Apple authorization code, if returned>",
  "nonce": "<original raw nonce>",
  "name": { "given_name": "Optional", "family_name": "Optional" }
}
```

Requirements:
- Backend verifies Apple JWT signature using Apple's current JWKS; validates issuer, configured audience, expiration, issued-at, subject, and nonce.
- Backend verifies authorization code server-side when included and follows Apple's current token-revocation/validation requirements.
- The app must not send an Apple client secret; backend credentials remain server-side.
- Use Apple subject as the stable provider identity key. Email may be absent, relay-based, or change.
- Do not auto-link an existing NEXUS account solely by matching email. Require an authenticated existing account or a separate verified recovery/linking flow.
- First-time sign-in may create a new NEXUS account only if product policy and account-provisioning rules explicitly allow it.

Success (200):
```json
{
  "access_token": "<NEXUS access JWT>",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "<opaque one-time refresh credential>",
  "refresh_expires_in": 2592000,
  "user": { "id": "<uuid>", "email": "optional", "role": "viewer" }
}
```

Suggested errors: `INVALID_APPLE_TOKEN`, `APPLE_NONCE_MISMATCH`, `APPLE_IDENTITY_UNLINKED`, `ACCOUNT_LINK_REQUIRED`, `ACCOUNT_DISABLED`, `AUTH_RATE_LIMITED`.

## 5. Proposed refresh rotation — NOT IMPLEMENTED

### POST /api/v1/auth/refresh

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

Normative behavior:
1. Refresh token is high entropy and opaque; store only a cryptographic hash server-side.
2. Each refresh rotates the token atomically: presented token becomes unusable and a new token is returned.
3. Token records belong to a token family/session and include created, last-used, expiry, revoked, and replaced-by metadata.
4. Reuse of a previously rotated token revokes the entire family and records a security event.
5. Refresh checks account active state and relevant session/account revocation state.
6. A failed database lookup or unavailable session store fails closed.
7. Responses use `Cache-Control: no-store`; request/response bodies are redacted from logs.
8. Client serializes refresh requests to avoid accidental reuse caused by concurrent requests.

Suggested errors:
- 400 `INVALID_REFRESH_REQUEST`
- 401 `INVALID_REFRESH_TOKEN`
- 401 `REFRESH_TOKEN_REUSED`
- 401 `REFRESH_SESSION_REVOKED`
- 401 `REFRESH_TOKEN_EXPIRED`
- 403 `ACCOUNT_DISABLED`
- 503 `AUTH_SESSION_STORE_UNAVAILABLE`

## 6. Proposed logout/revocation alignment — BACKEND CHANGE REQUIRED

Existing `POST /api/auth/logout` and `POST /api/auth/logout-all` revoke access-session rows. With refresh-token families, they must also revoke:
- current family on logout;
- all user families on logout-all;
- all user families when password/role/account security state changes;
- affected family on refresh-token reuse detection.

Proposed versioned paths:
- `POST /api/v1/auth/logout` — revoke current refresh family and associated access session.
- `POST /api/v1/auth/logout-all` — revoke all user refresh families and access sessions.

The old routes remain supported for existing clients during migration.

## 7. Proposed mobile session DTOs

```swift
struct AuthTokenResponse: Decodable {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int
    let refreshToken: String
    let refreshExpiresIn: Int
    let user: AuthenticatedUserDTO
}
```

This is a conceptual client DTO; actual Swift code is not part of this documentation phase. JSON keys are snake_case on the wire and mapped explicitly.

## 8. Workspace authorization contract

For every workspace-scoped request:
- Include the selected workspace UUID in `X-NEXUS-WORKSPACE-ID`.
- Include NEXUS bearer access token.
- Server resolves user identity from the token/session, then loads active membership for the supplied workspace.
- Server scopes every database query and mutation by the authorized workspace ID.
- Server verifies resource ownership and role permissions; a valid membership alone does not authorize every operation.
- Client-provided user IDs, roles, ownership fields, or workspace IDs in request bodies are ignored or rejected where not part of the explicit DTO.

Errors:
- 401 `UNAUTHENTICATED`
- 403 `WORKSPACE_ACCESS_DENIED` or `FORBIDDEN`
- 428 `WORKSPACE_REQUIRED`
- 400 `INVALID_WORKSPACE_ID`
- 503 `WORKSPACE_ACCESS_UNAVAILABLE`

## 9. Common error envelope — PROPOSED

New versioned endpoints should converge on:
```json
{
  "error": {
    "code": "WORKSPACE_ACCESS_DENIED",
    "message": "You do not have access to this workspace.",
    "request_id": "<opaque request id>",
    "details": []
  }
}
```

Legacy endpoints currently return several flat error shapes; the iOS client must tolerate the existing shapes until the versioned API is adopted.

## 10. Pagination and idempotency — PROPOSED

Cursor list response:
```json
{
  "items": [],
  "page": { "next_cursor": "<opaque-or-null>", "has_more": false }
}
```

Rules:
- Stable server-side ordering with a unique tie-breaker.
- Cursor is opaque and scoped to the authenticated user and workspace.
- Enforce bounded page size.
- Writes that can be retried accept `Idempotency-Key`; the server stores key, actor, workspace, request fingerprint, and result for a bounded retention period.
- Reusing a key with a different request fingerprint returns 409 `IDEMPOTENCY_KEY_CONFLICT`.

## 11. APNs device registration — NOT IMPLEMENTED

Proposed endpoint for a later phase:
- `PUT /api/v1/devices/apns` — register/update device token for current user and app environment.
- `DELETE /api/v1/devices/apns/{deviceId}` — deregister device.
- Device token is not an authentication credential.
- Bind device record to authenticated account; support token rotation and logout cleanup.
- Push payloads contain only opaque resource references and minimal non-sensitive text; app fetches authorized details after opening.

## 12. API acceptance gates before iOS feature implementation

- Apple exchange passes positive and negative tests for signature, issuer, audience, expiry, nonce, unknown subject, relay email, and account-link collision.
- Refresh rotation is atomic under concurrent refresh attempts.
- Reuse of an old refresh token revokes the family and is auditable without leaking secrets.
- Logout and logout-all revoke refresh families and access sessions.
- Workspace cross-tenant tests prove no read/write leakage for every mobile-exposed resource.
- Pagination is stable under concurrent inserts and never crosses workspace boundaries.
- Idempotency tests prove duplicate mutation requests do not create duplicate effects.
- API documentation is generated from or contract-tested against actual server DTOs.

## 13. Source references in repository

- `services/api/src/index.ts` — router mounting and API base.
- `services/api/src/auth/auth.routes.ts` — existing login, me, logout, logout-all, admin session revocation.
- `services/api/src/auth/auth.middleware.ts` — bearer JWT and active-session validation.
- `services/api/src/auth/auth-session.repository.ts` — PostgreSQL-backed access session lifecycle.
- `services/api/src/workspaces/workspace.middleware.ts` — workspace membership guard and integration token guard.
- `services/api/src/workspaces/workspace.repository.ts` — workspace membership and integration persistence.
- `database/init/009_auth_sessions.sql` — access-session schema and security-state revocation trigger.
- `database/init/011_workspace_identity_and_ownership.sql` — workspace, membership, integration, and nullable ownership schema.
- `apps/web/app/api/auth/login/route.ts` — web login proxy; not an Apple mobile endpoint.
- `apps/web/api/client.ts` — web same-origin API client and workspace header behavior.
