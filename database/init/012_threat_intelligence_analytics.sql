-- Threat intelligence and predictive analytics foundation.
-- All derived records are workspace-scoped and retain event provenance.
CREATE TABLE IF NOT EXISTS threat_indicators (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  indicator_type VARCHAR(24) NOT NULL CHECK (
    indicator_type IN ('ip', 'domain', 'url', 'file_hash', 'email', 'other')
  ),
  indicator_value_hash CHAR(64) NOT NULL CHECK (indicator_value_hash ~ '^[a-f0-9]{64}$'),
  source VARCHAR(80) NOT NULL,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  severity VARCHAR(16) NOT NULL CHECK (
    severity IN ('informational', 'low', 'medium', 'high', 'critical')
  ),
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  provenance JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_threat_indicator_seen_range CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_threat_indicators_workspace_fingerprint
  ON threat_indicators (workspace_id, indicator_type, indicator_value_hash, source);
CREATE INDEX IF NOT EXISTS idx_threat_indicators_workspace_severity
  ON threat_indicators (workspace_id, severity, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS threat_risk_assessments (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  security_event_id UUID NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  assessment_method VARCHAR(64) NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence) = 'array'),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workspace_id, security_event_id)
    REFERENCES security_events (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_threat_risk_workspace_score
  ON threat_risk_assessments (workspace_id, risk_score DESC, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_risk_event_assessed
  ON threat_risk_assessments (workspace_id, security_event_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS threat_anomaly_findings (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  security_event_id UUID NOT NULL,
  anomaly_score NUMERIC(7,4) NOT NULL CHECK (anomaly_score >= 0),
  threshold NUMERIC(7,4) NOT NULL CHECK (threshold >= 0),
  detection_method VARCHAR(64) NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workspace_id, security_event_id)
    REFERENCES security_events (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_threat_anomalies_workspace_created
  ON threat_anomaly_findings (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS threat_attack_correlations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  correlation_key CHAR(64) NOT NULL CHECK (correlation_key ~ '^[a-f0-9]{64}$'),
  pattern_type VARCHAR(64) NOT NULL,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence) = 'array'),
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (last_observed_at >= first_observed_at),
  UNIQUE (workspace_id, correlation_key)
);
CREATE TABLE IF NOT EXISTS threat_attack_correlation_events (
  workspace_id UUID NOT NULL,
  correlation_id UUID NOT NULL,
  security_event_id UUID NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, correlation_id, security_event_id),
  FOREIGN KEY (workspace_id, correlation_id)
    REFERENCES threat_attack_correlations (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, security_event_id)
    REFERENCES security_events (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_threat_correlation_events_event
  ON threat_attack_correlation_events (workspace_id, security_event_id);

CREATE TABLE IF NOT EXISTS threat_early_warnings (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  correlation_id UUID,
  risk_assessment_id UUID,
  warning_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (
    severity IN ('informational', 'low', 'medium', 'high', 'critical')
  ),
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'acknowledged', 'dismissed', 'resolved')
  ),
  explanation VARCHAR(2000) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workspace_id, correlation_id)
    REFERENCES threat_attack_correlations (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, risk_assessment_id)
    REFERENCES threat_risk_assessments (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_threat_warnings_workspace_status
  ON threat_early_warnings (workspace_id, status, severity, created_at DESC);
