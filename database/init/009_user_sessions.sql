CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_expiry
  ON user_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry_active
  ON user_sessions (expires_at)
  WHERE revoked_at IS NULL;
