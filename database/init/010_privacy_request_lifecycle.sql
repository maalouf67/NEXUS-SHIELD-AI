-- Additive privacy request lifecycle foundation. No existing records are modified.
CREATE TABLE IF NOT EXISTS privacy_requests (
  id UUID PRIMARY KEY,
  subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  request_type VARCHAR(24) NOT NULL CHECK (request_type IN ('access','rectification','erasure','restriction','objection','portability')),
  status VARCHAR(32) NOT NULL DEFAULT 'received' CHECK (status IN ('received','identity_verification_required','verified','in_review','processing','blocked','completed','rejected','withdrawn')),
  scope_categories TEXT[] NOT NULL DEFAULT '{}',
  subject_note VARCHAR(500),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  assigned_reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT privacy_requests_note_not_blank CHECK (subject_note IS NULL OR length(btrim(subject_note)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_subject_received
  ON privacy_requests (subject_user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_received
  ON privacy_requests (status, received_at ASC);

CREATE TABLE IF NOT EXISTS privacy_request_events (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES privacy_requests(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_code VARCHAR(48) NOT NULL,
  from_status VARCHAR(32),
  to_status VARCHAR(32),
  reason_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_privacy_request_events_request_created
  ON privacy_request_events (request_id, created_at ASC);

CREATE TABLE IF NOT EXISTS privacy_request_targets (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES privacy_requests(id) ON DELETE CASCADE,
  system_code VARCHAR(48) NOT NULL,
  data_category VARCHAR(48) NOT NULL,
  action_code VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','exception_review','blocked','not_applicable')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  last_error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, system_code, data_category, action_code)
);
CREATE INDEX IF NOT EXISTS idx_privacy_request_targets_request_status
  ON privacy_request_targets (request_id, status);

-- Preserve the privacy audit trail: events may be appended but never rewritten or deleted.
CREATE OR REPLACE FUNCTION prevent_privacy_request_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'privacy request events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_privacy_request_events_append_only ON privacy_request_events;
CREATE TRIGGER trg_privacy_request_events_append_only
BEFORE UPDATE OR DELETE ON privacy_request_events
FOR EACH ROW EXECUTE FUNCTION prevent_privacy_request_event_mutation();
