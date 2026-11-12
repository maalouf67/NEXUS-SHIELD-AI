-- Native iOS authentication foundation: Apple identity mapping and rotating refresh sessions.
-- Existing access sessions remain authoritative; refresh families are bound to one user/session pair.
-- Raw refresh-token values are never persisted.

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_sessions_id_user_id
  ON auth_sessions (id, user_id);

CREATE TABLE IF NOT EXISTS apple_identities (
  provider VARCHAR(16) NOT NULL CHECK (provider = 'apple'),
  provider_subject VARCHAR(255) NOT NULL CHECK (length(btrim(provider_subject)) BETWEEN 1 AND 255),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_authenticated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_apple_identities PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_apple_identities_user
  ON apple_identities (user_id, provider);

CREATE TABLE IF NOT EXISTS auth_refresh_token_families (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(64),
  reuse_detected_at TIMESTAMPTZ,
  CONSTRAINT fk_auth_refresh_families_session_user
    FOREIGN KEY (session_id, user_id)
    REFERENCES auth_sessions (id, user_id) ON DELETE CASCADE,
  CONSTRAINT chk_auth_refresh_families_expiry
    CHECK (expires_at > created_at),
  CONSTRAINT chk_auth_refresh_families_revocation
    CHECK (
      (revoked_at IS NULL AND revocation_reason IS NULL)
      OR revoked_at IS NOT NULL
    ),
  CONSTRAINT chk_auth_refresh_families_reuse_revoked
    CHECK (reuse_detected_at IS NULL OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_families_user_active
  ON auth_refresh_token_families (user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_refresh_families_session
  ON auth_refresh_token_families (session_id, id);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES auth_refresh_token_families(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL,
  parent_token_id UUID,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  reuse_detected_at TIMESTAMPTZ,
  CONSTRAINT uq_auth_refresh_tokens_family_id_id UNIQUE (family_id, id),
  CONSTRAINT uq_auth_refresh_tokens_token_hash UNIQUE (token_hash),
  CONSTRAINT chk_auth_refresh_tokens_hash
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT chk_auth_refresh_tokens_expiry
    CHECK (expires_at > issued_at),
  CONSTRAINT chk_auth_refresh_tokens_parent_not_self
    CHECK (parent_token_id IS NULL OR parent_token_id <> id),
  CONSTRAINT fk_auth_refresh_tokens_family_parent
    FOREIGN KEY (family_id, parent_token_id)
    REFERENCES auth_refresh_tokens (family_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_auth_refresh_tokens_reuse_revoked
    CHECK (reuse_detected_at IS NULL OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family_issued
  ON auth_refresh_tokens (family_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_active_expiry
  ON auth_refresh_tokens (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
