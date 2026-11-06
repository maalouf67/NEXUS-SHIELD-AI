# NEXUS SHIELD AI — server-side access-session security

**Implementation branch:** `feat/server-session-revocation-issue-25`  
**Tracked work:** [Issue #25](https://github.com/maalouf67/NEXUS-SHIELD-AI/issues/25)  
**Status:** implementation and automated validation in progress; not merged or production-deployed.

## Session model

- Login creates a cryptographically random UUID session identifier and stores it with the user ID and 15-minute expiry in PostgreSQL.
- The signed HS256 access JWT contains the user subject and the session identifier in its `jti` claim. The raw bearer token is never persisted.
- Every protected API request validates the signature, algorithm, issuer, audience, expiry and UUID claims, then looks up the active session and the current user record.
- A session is accepted only when its row exists, belongs to the token subject, has not expired, has not been revoked, and the user is still active.
- The current role and email are loaded from PostgreSQL on each authenticated request. Old JWT role claims are not trusted.
- Database access failure returns HTTP 503 from protected routes. The middleware never bypasses session validation when the session store is unavailable.

## Revocation actions

| Endpoint | Authorization | Effect |
|---|---|---|
| `POST /api/auth/logout` | Active access session | Revokes the current session |
| `POST /api/auth/logout-all` | Active access session | Revokes all active sessions for the current user |
| `POST /api/auth/users/:userId/sessions/revoke-all` | Administrator | Revokes all active sessions for the target user |

Migration 009 creates the session table and indexes. A PostgreSQL trigger revokes a user's active sessions when their role, active state or password hash changes, including changes made outside the API. User disablement also prevents authentication because the active-user join is checked on every request.

## Client behavior

- The web logout handler calls the API revocation endpoint before clearing the HttpOnly cookie. It always clears the local cookie, but returns `server_session_invalidated: false` and a warning when the API cannot confirm invalidation.
- The native Android app attempts server-side logout, then always clears its in-memory bearer token. When the API is unreachable, the interface explicitly warns that the old access token may remain valid until its 15-minute expiry.
- The separate Draft PR #14 React Native/iOS proposal has not yet been updated to use these endpoints. It is not release-ready on the strength of this work.

## Migration and compatibility

Migration 009 is additive and is applied only by the repository migration runner. CI applies it to a disposable PostgreSQL database. No production database was changed by this branch.

Before a production rollout:
1. Verify the intended database identity and take a backup with a tested restore path.
2. Review migration 009 and confirm the deployed API and database branch are compatible.
3. Apply migrations through an approved release procedure.
4. Deploy the API and web client in a coordinated maintenance window.
5. Verify login, single-session logout, logout-all, admin revocation, role-change revocation, account-disable revocation and session-store outage behavior.
6. Confirm that all clients handle the forced sign-in transition.

**Compatibility impact:** previously issued JWTs have no persisted session identifier. Once this enforcement is deployed, those tokens are rejected and users must sign in again. This is intentional fail-closed behavior, not a silent fallback to legacy token-only authentication.

No refresh-token flow is introduced. Password reset and password-change user interfaces are not part of this implementation; the database trigger is prepared to revoke sessions if the password hash is changed by a future approved flow.

## Required evidence before closing Issue #25

- [ ] Build/API test suite and PostgreSQL integration tests pass on the final branch head.
- [ ] Unknown, expired, revoked, wrong-user and disabled-user sessions are rejected.
- [ ] Role/account/password-hash changes revoke outstanding sessions.
- [ ] Single-session and all-session revocation work under concurrent requests.
- [ ] Session-store outage returns 503 and does not bypass authorization.
- [ ] Web and Android clients report local sign-out separately from confirmed server invalidation.
- [ ] React Native/iOS client is updated or explicitly kept out of the release scope.
- [ ] A production migration and rollback plan is approved; no database is migrated without that approval.
