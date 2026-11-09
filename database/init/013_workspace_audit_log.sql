-- Append-only audit trail for privileged workspace membership and integration changes.
-- Secrets and raw integration credentials must never be written to this table.
CREATE TABLE IF NOT EXISTS workspace_audit_logs (
  id UUID PRIMARY KEY,
  -- Retain identifiers without cascading deletion of historical audit evidence.
  workspace_id UUID NOT NULL,
  actor_user_id UUID,
  action VARCHAR(64) NOT NULL CHECK (
    action IN (
      'workspace.member.added',
      'workspace.integration.created',
      'workspace.integration.revoked'
    )
  ),
  target_type VARCHAR(32) NOT NULL CHECK (target_type IN ('membership', 'integration')),
  target_id VARCHAR(128) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_workspace_created
  ON workspace_audit_logs (workspace_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_actor_created
  ON workspace_audit_logs (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_workspace_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'workspace audit log records are immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_audit_logs_immutable ON workspace_audit_logs;
CREATE TRIGGER trg_workspace_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON workspace_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_audit_log_mutation();
