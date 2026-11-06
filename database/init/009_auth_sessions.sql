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
