CREATE TABLE IF NOT EXISTS api_rate_limit_counters (
  scope VARCHAR(80) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  hits INTEGER NOT NULL CHECK (hits >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_counters_reset_at
  ON api_rate_limit_counters (reset_at);
