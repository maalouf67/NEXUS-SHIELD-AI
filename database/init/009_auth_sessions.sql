CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(64),
  CONSTRAINT chk_auth_sessions_expiry CHECK (expires_at > created_at),
  CONSTRAINT chk_auth_sessions_revocation CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL)
    OR revoked_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
  ON auth_sessions (expires_at);

-- User security-state changes invalidate every outstanding access session.
-- This protects sessions even when a change is made outside the API process.
CREATE OR REPLACE FUNCTION revoke_auth_sessions_on_user_security_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE auth_sessions
  SET revoked_at = NOW(),
      revocation_reason = CASE
        WHEN OLD.is_active = TRUE AND NEW.is_active = FALSE THEN 'account_disabled'
        WHEN OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN 'credential_changed'
        ELSE 'role_changed'
      END
  WHERE user_id = NEW.id
    AND revoked_at IS NULL;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS users_revoke_auth_sessions ON users;

CREATE TRIGGER users_revoke_auth_sessions
AFTER UPDATE OF role, is_active, password_hash ON users
FOR EACH ROW
WHEN (
  OLD.role IS DISTINCT FROM NEW.role
  OR OLD.is_active IS DISTINCT FROM NEW.is_active
  OR OLD.password_hash IS DISTINCT FROM NEW.password_hash
)
EXECUTE FUNCTION revoke_auth_sessions_on_user_security_change();
