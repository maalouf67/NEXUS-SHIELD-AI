-- Threat Intelligence Feed Engine: source registry, immutable run evidence,
-- workspace-scoped indicator/event matches, and deduplicated early warnings.
CREATE TABLE IF NOT EXISTS threat_feeds (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider VARCHAR(80) NOT NULL CHECK (provider IN ('abuseipdb')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  confidence_minimum SMALLINT NOT NULL DEFAULT 90 CHECK (confidence_minimum BETWEEN 25 AND 100),
  freshness_window_hours SMALLINT NOT NULL DEFAULT 6 CHECK (freshness_window_hours BETWEEN 1 AND 168),
  last_generated_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS threat_feed_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  feed_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'stale')),
  generated_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  matched_events_count INTEGER NOT NULL DEFAULT 0 CHECK (matched_events_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  error_code VARCHAR(64),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
  FOREIGN KEY (workspace_id, feed_id)
    REFERENCES threat_feeds (workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS idx_threat_feed_runs_workspace_started
  ON threat_feed_runs (workspace_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_threat_indicators_workspace_id
  ON threat_indicators (workspace_id, id);

ALTER TABLE threat_early_warnings
  ADD COLUMN IF NOT EXISTS dedupe_key CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_threat_early_warnings_workspace_dedupe
  ON threat_early_warnings (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS threat_indicator_matches (
  workspace_id UUID NOT NULL,
  indicator_id UUID NOT NULL,
  security_event_id UUID NOT NULL,
  match_field VARCHAR(64) NOT NULL,
  matched_value_hash CHAR(64) NOT NULL CHECK (matched_value_hash ~ '^[a-f0-9]{64}$'),
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
  PRIMARY KEY (workspace_id, indicator_id, security_event_id),
  FOREIGN KEY (workspace_id, indicator_id)
    REFERENCES threat_indicators (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, security_event_id)
    REFERENCES security_events (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_threat_indicator_matches_event
  ON threat_indicator_matches (workspace_id, security_event_id, matched_at DESC);
