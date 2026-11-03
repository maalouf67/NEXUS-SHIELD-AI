CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  external_event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (
    severity IN ('informational', 'low', 'medium', 'high', 'critical')
  ),
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  asset_id VARCHAR(128),
  summary VARCHAR(1000) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
  review_status VARCHAR(16) NOT NULL DEFAULT 'new' CHECK (
    review_status IN ('new', 'reviewed')
  ),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_security_event_source_external_id UNIQUE (source, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_security_events_received_at
  ON security_events (received_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_security_events_severity_received
  ON security_events (severity, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_review_status
  ON security_events (review_status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_asset_id
  ON security_events (asset_id);

CREATE TABLE IF NOT EXISTS security_event_reviews (
  id UUID PRIMARY KEY,
  security_event_id UUID NOT NULL REFERENCES security_events(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(32) NOT NULL CHECK (action IN ('event.reviewed')),
  note VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_event_reviews_event_created
  ON security_event_reviews (security_event_id, created_at DESC);
