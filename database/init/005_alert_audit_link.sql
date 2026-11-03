ALTER TABLE incident_activity
  ADD COLUMN IF NOT EXISTS alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incident_activity_alert_created
  ON incident_activity (alert_id, created_at DESC);
