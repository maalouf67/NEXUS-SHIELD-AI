-- NEXUS Intelligence Fabric: workspace-scoped run, approval, and audit foundation.
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  agent_id VARCHAR(100) NOT NULL CHECK (agent_id ~ '^[a-z][a-z0-9.-]{1,99}$'),
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','completed','failed','cancelled')),
  task_type VARCHAR(120) NOT NULL CHECK (length(btrim(task_type)) BETWEEN 1 AND 120),
  input_hash CHAR(64) CHECK (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key VARCHAR(255) NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  workflow_id VARCHAR(255) UNIQUE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_status_created ON agent_runs (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_tool_approvals (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL,
  requester_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_id VARCHAR(100) NOT NULL,
  tool_name VARCHAR(160) NOT NULL CHECK (tool_name ~ '^[a-z][a-z0-9.-]*$'),
  tool_version VARCHAR(32) NOT NULL CHECK (tool_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  risk VARCHAR(24) NOT NULL CHECK (risk IN ('write','defensive_action','destructive')),
  input_hash CHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','consumed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  decided_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  FOREIGN KEY (workspace_id, run_id) REFERENCES agent_runs (workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, idempotency_key),
  CHECK (expires_at > requested_at),
  CHECK (
    (status = 'pending' AND decided_at IS NULL AND consumed_at IS NULL)
    OR (status IN ('approved','rejected') AND decided_at IS NOT NULL AND consumed_at IS NULL)
    OR (status = 'consumed' AND decided_at IS NOT NULL AND consumed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_workspace_pending ON agent_tool_approvals (workspace_id, status, expires_at);

CREATE TABLE IF NOT EXISTS agent_tool_audit_logs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  run_id UUID NOT NULL,
  request_id VARCHAR(128) NOT NULL,
  agent_id VARCHAR(100) NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tool_name VARCHAR(160) NOT NULL,
  tool_version VARCHAR(32) NOT NULL,
  risk VARCHAR(24) NOT NULL CHECK (risk IN ('read','analysis','write','defensive_action','destructive')),
  event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('requested','denied','started','succeeded','failed')),
  reason_code VARCHAR(80),
  input_hash CHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workspace_id, run_id) REFERENCES agent_runs (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_workspace_run_created ON agent_tool_audit_logs (workspace_id, run_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_agent_tool_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  -- Allow only PostgreSQL's nested FK action that anonymizes the actor pointer
  -- after the referenced user is deleted. All event content remains unchanged.
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() > 1
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(OLD) - 'actor_user_id') = (to_jsonb(NEW) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'agent tool audit events are append-only'
    USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_agent_tool_audit_immutable ON agent_tool_audit_logs;
DROP TRIGGER IF EXISTS trg_agent_tool_audit_no_truncate ON agent_tool_audit_logs;

-- Row-level enforcement avoids rejecting no-op FK checks against an empty table.
CREATE TRIGGER trg_agent_tool_audit_immutable
  BEFORE UPDATE OR DELETE ON agent_tool_audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_agent_tool_audit_mutation();

-- Keep bulk truncation blocked independently of row-level UPDATE/DELETE checks.
CREATE TRIGGER trg_agent_tool_audit_no_truncate
  BEFORE TRUNCATE ON agent_tool_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION reject_agent_tool_audit_mutation();

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_workspace_isolation ON agent_runs;
CREATE POLICY agent_runs_workspace_isolation ON agent_runs
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID);

ALTER TABLE agent_tool_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_tool_approvals_workspace_isolation ON agent_tool_approvals;
CREATE POLICY agent_tool_approvals_workspace_isolation ON agent_tool_approvals
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID);

ALTER TABLE agent_tool_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_tool_audit_workspace_isolation ON agent_tool_audit_logs;
CREATE POLICY agent_tool_audit_workspace_isolation ON agent_tool_audit_logs
  FOR ALL
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', TRUE), '')::UUID);
