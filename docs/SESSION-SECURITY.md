# NEXUS SHIELD AI — server-side access-session security

**Tracked work:** Issue #25 / Draft PR #29  
**Implementation branch:** `feat/server-session-revocation-issue-25`  
**Latest fully tested head:** `6a7a9f8a69b937374035a54d0cfc0e20869cac01`  
**Status:** implementation and CI validation passed; review, merge and production rollout remain open.

## Session model

- Login creates a cryptographically random UUID session identifier and stores it with the user ID and 15-minute expiry in PostgreSQL.
- The signed HS256 access JWT contains the user subject and the session identifier in its `jti` claim. The raw bearer token is never persisted.
- Every protected API request validates the token signature, algorithm, issuer, audience, expiry and UUID claims, then checks the active session and loads the user's current identity/role from PostgreSQL.
- A session is accepted only when its row exists, belongs to the token subject, has not expired, has not been revoked, and the user is active.
- The current role and email are loaded from PostgreSQL on every authenticated request. A stale role claim in an old JWT is not trusted.
- A database/session-store failure returns HTTP 503 from protected API routes. The middleware fails closed and does not fall back to token-only authentication.

## Revocation endpoints

| Endpoint | Authorization | Effect |
|---|---|---|
| `POST /api/auth/logout` | Active access session | Revokes the current session |
| `POST /api/auth/logout-all` | Active access session | Revokes all active sessions belonging to the current user |
| `POST /api/auth/users/:userId/sessions/revoke-all` | Administrator | Revokes all active sessions for the target user and records the administrator actor |

Migration `009_auth_sessions.sql` creates the session table and indexes. A PostgreSQL trigger revokes a user's sessions when their role, active state or password hash changes, including changes made outside the API. The session creation transaction locks and rechecks the current user/password state to prevent a login-vs-password-change race.

Expired session metadata is removed in bounded batches during login; expiry indexes support this cleanup.

## Client behavior

- The web logout handler calls the API revocation endpoint before clearing the HttpOnly cookie. It always clears the local cookie, but returns `server_session_invalidated: false` and a warning when the API cannot confirm invalidation.
- The web `/auth/me` handler clears the cookie only after an explicit upstream 401. An upstream 503/session-store outage is returned as 503 and preserves the browser cookie for retry.
- The native Android app attempts server-side logout, then always clears its in-memory bearer token. When the API is unreachable, the UI warns that the old access token may remain valid until its 15-minute expiry.
- React Native/iOS in the separate Draft PR #14 has not yet adopted the new logout endpoint and remains outside the release-ready scope.

## Validation evidence

On head `6a7a9f8a69b937374035a54d0cfc0e20869cac01` (2026-11-06):
- Build and Test run #426: **PASSED** — web/API build, API tests, PostgreSQL schema/migration idempotency, PostgreSQL session lifecycle integration, Python 3.11/3.13, Android debug build/unit tests, MASVS/MASTG register completeness, and Docker/ClamAV/web upload integration.
- Security Checks run #376: **PASSED** — Trivy filesystem, dependency, secret and PostgreSQL/AI/ClamAV runtime-image scans, Dependency Review, gosu upstream parity/reachability checks and root-owned-volume PostgreSQL startup test.
- Session integration tests cover active, unknown, expired, revoked and wrong-user identifiers; disabled accounts; role/password-hash changes; session audit actor/reason; stale credentials; and concurrent session creation and logout-all revocation.
- Unit tests cover single logout, logout-all, administrator revocation, JWT session identifiers and fail-closed handling when session storage is unavailable.

These are CI results for this exact branch head. They are not evidence of a live Railway migration, production session-store availability, a physical-device security certification or a merged release.

## Migration and compatibility

Migration 009 is additive. It has not been applied to a production database by this branch.

Before production rollout:
1. Verify the intended database identity and take a backup with a tested restore path.
2. Review migration 009, the API startup schema preflight and the deployment configuration.
3. Apply migrations through the approved release procedure.
4. Deploy the API and web client in a coordinated maintenance window.
5. Verify login, single-session logout, logout-all, admin revocation, role-change revocation, password-change revocation, account-disable revocation and session-store outage behavior.
6. Confirm all clients handle the forced sign-in transition.

**Compatibility impact:** previously issued JWTs without a corresponding `jti` session row are rejected after enforcement is deployed. Users will need to sign in again. This is intentional fail-closed behavior, not a silent fallback to legacy token-only authentication.

No refresh-token flow is introduced. Password reset/change UI is not part of this branch; the database trigger is prepared to revoke sessions if the password hash is changed by a future approved flow.

## Remaining release gates

- [ ] Complete review of PR #29 and merge its base dependency PR #26 first.
- [ ] Update or formally exclude the React Native/iOS client from the release scope.
- [ ] Complete web/Android offline-sign-out and device-loss tests on release artifacts.
- [ ] Approve the production migration, backup/restore and rollback procedure.
- [ ] Validate the feature on the actual hosted PostgreSQL/session store after deployment.
