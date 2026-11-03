ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS incident_activity (
  id UUID PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  from_status VARCHAR(32),
  to_status VARCHAR(32),
  note VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_created_at
  ON incidents (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_incidents_severity_status
  ON incidents (severity, status);

CREATE INDEX IF NOT EXISTS idx_incident_activity_incident_created
  ON incident_activity (incident_id, created_at DESC);
