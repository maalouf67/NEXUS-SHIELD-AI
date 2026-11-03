CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(128) PRIMARY KEY,
  asset_type VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description VARCHAR(500),
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_evidence (
  asset_id VARCHAR(128) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  evidence_id VARCHAR(128) NOT NULL,
  source VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('verified', 'unverified', 'stale', 'missing')),
  recorded_at TIMESTAMPTZ NOT NULL,
  note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, evidence_id, source)
);

CREATE TABLE IF NOT EXISTS asset_relationships (
  id VARCHAR(128) PRIMARY KEY,
  from_asset_id VARCHAR(128) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  to_asset_id VARCHAR(128) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  relationship_type VARCHAR(64) NOT NULL,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationship_evidence (
  relationship_id VARCHAR(128) NOT NULL REFERENCES asset_relationships(id) ON DELETE CASCADE,
  evidence_id VARCHAR(128) NOT NULL,
  source VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('verified', 'unverified', 'stale', 'missing')),
  recorded_at TIMESTAMPTZ NOT NULL,
  note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (relationship_id, evidence_id, source)
);

CREATE INDEX IF NOT EXISTS idx_asset_evidence_status
  ON asset_evidence(status);

CREATE INDEX IF NOT EXISTS idx_asset_relationships_from_asset
  ON asset_relationships(from_asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_relationships_to_asset
  ON asset_relationships(to_asset_id);
