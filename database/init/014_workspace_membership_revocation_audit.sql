-- Audit who revoked a workspace membership.
-- Historical revocations remain valid with a NULL actor.
ALTER TABLE workspace_memberships
  ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_revocation_audit
  ON workspace_memberships (workspace_id, revoked_at DESC, revoked_by_user_id)
  WHERE status = 'revoked';
