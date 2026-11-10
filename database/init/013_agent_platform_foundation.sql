-- NEXUS Agent Platform foundation (additive migration).
-- Apply only through the repository migration runner after backup/review.
CREATE TABLE IF NOT EXISTS nexus_agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    task_id VARCHAR(128) NOT NULL,
    agent_id VARCHAR(160) NOT NULL,
    request_json JSONB NOT NULL,
    result_json JSONB NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, task_id)
);

CREATE TABLE IF NOT EXISTS nexus_agent_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    run_id UUID NOT NULL REFERENCES nexus_agent_runs(id) ON DELETE CASCADE,
    subject VARCHAR(200) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    UNIQUE (tenant_id, run_id)
);

CREATE INDEX IF NOT EXISTS nexus_agent_runs_tenant_created_idx
    ON nexus_agent_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nexus_agent_outbox_pending_idx
    ON nexus_agent_outbox (created_at) WHERE delivered_at IS NULL;

ALTER TABLE nexus_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_agent_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE nexus_agent_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_agent_outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nexus_agent_runs_tenant_isolation ON nexus_agent_runs;
CREATE POLICY nexus_agent_runs_tenant_isolation ON nexus_agent_runs
    USING (tenant_id = NULLIF(current_setting('nexus.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('nexus.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS nexus_agent_outbox_tenant_isolation ON nexus_agent_outbox;
CREATE POLICY nexus_agent_outbox_tenant_isolation ON nexus_agent_outbox
    USING (tenant_id = NULLIF(current_setting('nexus.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('nexus.tenant_id', true), '')::uuid);

COMMENT ON TABLE nexus_agent_runs IS 'Tenant-scoped, auditable results from NEXUS agent executions.';
COMMENT ON TABLE nexus_agent_outbox IS 'Transactional outbox for reliable publication of agent events to NATS JetStream.';
