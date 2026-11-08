-- Workspace identity and ownership foundation.
-- Existing records intentionally remain NULL-scoped until an owner-approved backfill.
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  slug VARCHAR(80) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'revoked')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT chk_workspace_membership_revocation CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status <> 'revoked' AND revoked_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_active
  ON workspace_memberships (user_id, workspace_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_role
  ON workspace_memberships (workspace_id, role, user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS workspace_integrations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  permissions TEXT[] NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT chk_workspace_integration_permissions CHECK (
    cardinality(permissions) BETWEEN 1 AND 3
    AND permissions <@ ARRAY['assets:read', 'assets:write', 'events:write']::TEXT[]
  ),
  CONSTRAINT chk_workspace_integration_revocation CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status = 'active' AND revoked_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_workspace_integrations_active
  ON workspace_integrations (workspace_id, id)
  WHERE status = 'active';

-- Nullable ownership columns preserve all legacy rows without assigning them
-- to the first user or workspace that becomes active.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE incident_activity
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE security_events
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE security_event_reviews
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE asset_evidence
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE asset_relationships
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE relationship_evidence
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;

-- Composite keys/FKs prevent newly scoped children and relationships from
-- linking to a parent record belonging to a different workspace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_workspace_id_id
  ON incidents (workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_workspace_id_id
  ON alerts (workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_security_events_workspace_id_id
  ON security_events (workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_workspace_id_id
  ON assets (workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_relationships_workspace_id_id
  ON asset_relationships (workspace_id, id);

ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS fk_alerts_workspace_incident;
ALTER TABLE alerts
  ADD CONSTRAINT fk_alerts_workspace_incident
  FOREIGN KEY (workspace_id, incident_id)
  REFERENCES incidents (workspace_id, id);

ALTER TABLE incident_activity
  DROP CONSTRAINT IF EXISTS fk_incident_activity_workspace_incident;
ALTER TABLE incident_activity
  ADD CONSTRAINT fk_incident_activity_workspace_incident
  FOREIGN KEY (workspace_id, incident_id)
  REFERENCES incidents (workspace_id, id);

ALTER TABLE incident_activity
  DROP CONSTRAINT IF EXISTS fk_incident_activity_workspace_alert;
ALTER TABLE incident_activity
  ADD CONSTRAINT fk_incident_activity_workspace_alert
  FOREIGN KEY (workspace_id, alert_id)
  REFERENCES alerts (workspace_id, id);

-- Preserve the existing global idempotency rule for legacy rows that remain
-- unassigned, while allowing the same upstream identifier in separate workspaces.
ALTER TABLE security_events
  DROP CONSTRAINT IF EXISTS uq_security_event_source_external_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_security_event_legacy_source_external
  ON security_events (source, external_event_id)
  WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_security_event_workspace_source_external
  ON security_events (workspace_id, source, external_event_id)
  WHERE workspace_id IS NOT NULL;

ALTER TABLE security_event_reviews
  DROP CONSTRAINT IF EXISTS fk_security_event_reviews_workspace_event;
ALTER TABLE security_event_reviews
  ADD CONSTRAINT fk_security_event_reviews_workspace_event
  FOREIGN KEY (workspace_id, security_event_id)
  REFERENCES security_events (workspace_id, id);

ALTER TABLE asset_evidence
  DROP CONSTRAINT IF EXISTS fk_asset_evidence_workspace_asset;
ALTER TABLE asset_evidence
  ADD CONSTRAINT fk_asset_evidence_workspace_asset
  FOREIGN KEY (workspace_id, asset_id)
  REFERENCES assets (workspace_id, id);

ALTER TABLE asset_relationships
  DROP CONSTRAINT IF EXISTS fk_asset_relationships_workspace_from_asset;
ALTER TABLE asset_relationships
  ADD CONSTRAINT fk_asset_relationships_workspace_from_asset
  FOREIGN KEY (workspace_id, from_asset_id)
  REFERENCES assets (workspace_id, id);

ALTER TABLE asset_relationships
  DROP CONSTRAINT IF EXISTS fk_asset_relationships_workspace_to_asset;
ALTER TABLE asset_relationships
  ADD CONSTRAINT fk_asset_relationships_workspace_to_asset
  FOREIGN KEY (workspace_id, to_asset_id)
  REFERENCES assets (workspace_id, id);

ALTER TABLE relationship_evidence
  DROP CONSTRAINT IF EXISTS fk_relationship_evidence_workspace_relationship;
ALTER TABLE relationship_evidence
  ADD CONSTRAINT fk_relationship_evidence_workspace_relationship
  FOREIGN KEY (workspace_id, relationship_id)
  REFERENCES asset_relationships (workspace_id, id);

CREATE INDEX IF NOT EXISTS idx_incidents_workspace_created
  ON incidents (workspace_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_alerts_workspace_created
  ON alerts (workspace_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_security_events_workspace_received
  ON security_events (workspace_id, received_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_assets_workspace_id
  ON assets (workspace_id, id);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_workspace_id
  ON asset_relationships (workspace_id, id);
