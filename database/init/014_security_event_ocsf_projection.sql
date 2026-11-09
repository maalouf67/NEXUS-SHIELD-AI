-- Workspace-scoped, versioned OCSF projections for trusted security-event ingestion.
-- Raw provider attributes are intentionally not copied into this table.
CREATE TABLE IF NOT EXISTS security_event_ocsf_records (
  workspace_id UUID NOT NULL,
  security_event_id UUID NOT NULL,
  schema_version VARCHAR(16) NOT NULL CHECK (schema_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'),
  normalized_event JSONB NOT NULL CHECK (jsonb_typeof(normalized_event) = 'object'),
  normalized_sha256 CHAR(64) NOT NULL CHECK (normalized_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, security_event_id, schema_version),
  CONSTRAINT fk_security_event_ocsf_workspace_event
    FOREIGN KEY (workspace_id, security_event_id)
    REFERENCES security_events (workspace_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_event_ocsf_workspace_created
  ON security_event_ocsf_records (workspace_id, created_at DESC);
