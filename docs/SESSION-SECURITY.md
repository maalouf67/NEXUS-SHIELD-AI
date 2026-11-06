# NEXUS SHIELD AI — server-side access-session security

**Implementation branch:** `feat/server-session-revocation-issue-25`  
**Tracked work:** [Issue #25](https://github.com/maalouf67/NEXUS-SHIELD-AI/issues/25)  
**Status:** implementation merged into `main`; production deployment and database migration have not been performed.

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

## Validation evidence

- PR #29 merged to `main` in merge commit `834f99edee047afae78326350df2818f9d59688d` on 2026-11-06.
- Build and Test run #468 **PASSED** on the final PR head `fd2abbfe0d5d948bc0c96528384e813a25731122`: API/web build and tests, nine ordered PostgreSQL migrations and idempotency, PostgreSQL session lifecycle integration, Python 3.11/3.13, Android debug build and DNS codec unit tests, MASVS/MASTG register completeness, and real Docker/ClamAV/web upload integration.
- Security Checks run #417 **PASSED** on the same final PR head: Trivy filesystem/dependency/secret scan, PostgreSQL/AI/ClamAV runtime-image scans, Dependency Review, pinned gosu source parity/reachability checks, and PostgreSQL root-owned-volume startup validation.
- The in-memory session repository is selected only in the test environment. Production uses the PostgreSQL repository. CI runs a separate PostgreSQL integration test against an ephemeral CI database.
- These checks do not establish live Railway compatibility, production session-store availability, physical-device security certification or a production deployment.

## Migration and compatibility

Migration 009 is additive and is applied by the repository migration runner. CI applies it to an ephemeral PostgreSQL database and verifies idempotency. It has **not** been applied to a production database.

Before a production rollout:
1. Verify the intended database identity and take a backup with a tested restore path.
2. Review migration 009 and confirm the deployed API and database branch are compatible.
3. Apply migrations through an approved release procedure.
4. Deploy the API and web client in a coordinated maintenance window.
5. Verify login, single-session logout, logout-all, admin revocation, role-change revocation, account-disable revocation and session-store outage behavior.
6. Confirm that all clients handle the forced sign-in transition.
7. Document and approve the rollback procedure before the migration window.

**Compatibility impact:** previously issued JWTs have no persisted session identifier. Once this enforcement is deployed, those tokens are rejected and users must sign in again. This is intentional fail-closed behavior, not a silent fallback to legacy token-only authentication.

No refresh-token flow is introduced. Password reset and password-change user interfaces are not part of this implementation; the database trigger is prepared to revoke sessions if the password hash is changed by a future approved flow. MFA/passkeys are also not part of PR #29.

## Required evidence before closing Issue #25

- [x] Build/API tests and PostgreSQL integration tests pass on the final PR head.
- [x] Unknown, expired, revoked, wrong-user and disabled-user sessions are rejected.
- [x] Role/account/password-hash changes revoke outstanding sessions.
- [x] Single-session and all-session revocation are tested, including concurrent revocation.
- [x] Session-store outage returns 503 and does not bypass authorization.
- [x] Web and Android clients report local sign-out separately from confirmed server invalidation.
- [ ] React Native/iOS client is updated or explicitly kept out of the release scope.
- [ ] A production migration and rollback plan is approved; no database is migrated without that approval.
- [ ] Validate against the actual hosted PostgreSQL/session store after an explicitly approved deployment.
