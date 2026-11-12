-- Current-state revocation metadata on the membership row.
ALTER TABLE workspace_memberships
  ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_revocation_audit
  ON workspace_memberships (workspace_id, revoked_at DESC, revoked_by_user_id)
  WHERE status = 'revoked';

-- Append-only, workspace-scoped history. Member and actor UUIDs are intentionally
-- retained without user foreign keys so deleting an account cannot erase the audit trail.
CREATE TABLE IF NOT EXISTS workspace_membership_events (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  member_user_id UUID NOT NULL,
  actor_user_id UUID,
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN ('member_added','membership_reactivated','membership_revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_membership_events_member_created
  ON workspace_membership_events (workspace_id, member_user_id, created_at ASC);

CREATE OR REPLACE FUNCTION prevent_workspace_membership_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'workspace membership events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspace_membership_events_append_only ON workspace_membership_events;
CREATE TRIGGER trg_workspace_membership_events_append_only
BEFORE UPDATE OR DELETE ON workspace_membership_events
FOR EACH ROW EXECUTE FUNCTION prevent_workspace_membership_event_mutation();
