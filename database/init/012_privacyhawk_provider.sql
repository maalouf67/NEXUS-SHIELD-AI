-- PrivacyHawk partner API integration. Additive only; existing data is untouched.
-- Personal profile fields are sent only after explicit per-scan consent and are
-- intentionally not copied into these tables.

CREATE TABLE IF NOT EXISTS privacyhawk_provider_consents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  consent_version VARCHAR(32) NOT NULL,
  purpose VARCHAR(32) NOT NULL CHECK (purpose = 'data_broker_scan'),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_privacyhawk_consents_user_granted
  ON privacyhawk_provider_consents (user_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS privacyhawk_scan_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider_scan_id VARCHAR(128) UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'submitting'
    CHECK (status IN ('submitting','created','in_progress','completed','failed','stopped','deleted','unknown')),
  broker_count INTEGER CHECK (broker_count IS NULL OR broker_count >= 0),
  realtime BOOLEAN NOT NULL DEFAULT TRUE,
  last_error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_privacyhawk_scan_runs_user_created
  ON privacyhawk_scan_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS privacyhawk_provider_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scan_run_id UUID NOT NULL REFERENCES privacyhawk_scan_runs(id) ON DELETE RESTRICT,
  event_code VARCHAR(48) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_privacyhawk_events_scan_created
  ON privacyhawk_provider_events (scan_run_id, created_at ASC);

-- Consent and provider event history are append-only.
CREATE OR REPLACE FUNCTION prevent_privacyhawk_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PrivacyHawk consent and provider events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_privacyhawk_consents_append_only ON privacyhawk_provider_consents;
CREATE TRIGGER trg_privacyhawk_consents_append_only
BEFORE UPDATE OR DELETE ON privacyhawk_provider_consents
FOR EACH ROW EXECUTE FUNCTION prevent_privacyhawk_audit_mutation();

DROP TRIGGER IF EXISTS trg_privacyhawk_events_append_only ON privacyhawk_provider_events;
CREATE TRIGGER trg_privacyhawk_events_append_only
BEFORE UPDATE OR DELETE ON privacyhawk_provider_events
FOR EACH ROW EXECUTE FUNCTION prevent_privacyhawk_audit_mutation();
