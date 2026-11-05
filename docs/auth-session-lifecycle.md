# NEXUS SHIELD AI — Server-side access-session lifecycle

## Access-token contract

- Access JWTs are HS256-signed, issuer/audience-validated, and expire after 15 minutes.
- Every production token includes a random UUID `jti`.
- PostgreSQL stores the session identifier, user ID, timestamps and revocation state—not the raw bearer token.
- Each protected request checks the session and reads the user's current active state and role. Account disablement and role changes take effect before JWT expiry.
- If PostgreSQL cannot be reached during session validation, protected requests fail closed with HTTP 503.

## Endpoints

- `POST /api/auth/logout`: revoke the current token's session; replay returns 401.
- `POST /api/auth/logout-all`: revoke all active sessions for the current user, including the caller session; returns the revoked count.
- `GET /api/auth/me`: returns identity and role from current database session state.

## Storage and cleanup

- Migration `009_user_sessions.sql` adds a foreign-keyed session table with expiry/revocation timestamps and indexes.
- Old expired and revoked records are opportunistically cleaned during login. User deletion cascades session rows.
- No refresh tokens are introduced.

## Release gates

- Apply the numbered migration using the repository migration runner before rolling out the API.
- Validate database TLS, least-privilege credentials, backup/restore, pool sizing and failover against the hosted database.
- Web BFF and native mobile clients must call API revocation on logout before deleting local credentials; they must report offline/API failures honestly.
- Password-reset workflows should revoke all sessions as part of the reset transaction.
- This does not implement workspace/tenant isolation; Issue #24 remains separate.
