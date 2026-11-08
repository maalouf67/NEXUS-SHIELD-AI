-- Additive metadata-only foundation for authorized user imports.
-- No raw source payloads, emails, names, passwords, tokens, MFA material,
-- session IDs, or other raw personal data are stored by this migration.

CREATE TABLE IF NOT EXISTS user_import_batches (
  id UUID PRIMARY KEY,
  source_system_code VARCHAR(48) NOT NULL
    CHECK (source_system_code ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  source_schema_version VARCHAR(32) NOT NULL,
  field_map_version VARCHAR(32) NOT NULL,
  batch_checksum CHAR(64) NOT NULL
    CHECK (batch_checksum ~ '^[a-f0-9]{64}$'),
  approval_digest CHAR(64)
    CHECK (approval_digest IS NULL OR approval_digest ~ '^[a-f0-9]{64}$'),
  status VARCHAR(24) NOT NULL DEFAULT 'created'
    CHECK (status IN (
      'created','validating','preview_ready','awaiting_approval',
      'approved','applying','completed','rejected','failed','blocked',
      'cancelled','rollback_review'
    )),
  total_records INTEGER NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  valid_records INTEGER NOT NULL DEFAULT 0 CHECK (valid_records >= 0),
  rejected_records INTEGER NOT NULL DEFAULT 0 CHECK (rejected_records >= 0),
  conflict_records INTEGER NOT NULL DEFAULT 0 CHECK (conflict_records >= 0),
  provisioned_records INTEGER NOT NULL DEFAULT 0 CHECK (provisioned_records >= 0),
  skipped_records INTEGER NOT NULL DEFAULT 0 CHECK (skipped_records >= 0),
  failed_records INTEGER NOT NULL DEFAULT 0 CHECK (failed_records >= 0),
  -- Actor IDs are immutable audit references, deliberately not foreign keys.
  initiated_by_user_id UUID,
  approved_by_user_id UUID,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_import_approval_pair CHECK (
    (approved_by_user_id IS NULL AND approved_at IS NULL AND approval_digest IS NULL)
    OR
    (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND approval_digest IS NOT NULL)
  ),
  CONSTRAINT chk_user_import_counts CHECK (
    valid_records + rejected_records + conflict_records <= total_records
  )
);

CREATE INDEX IF NOT EXISTS idx_user_import_batches_status_created
  ON user_import_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_import_batches_source_created
  ON user_import_batches (source_system_code, created_at DESC);

-- Store only a keyed digest of the source subject identifier, never the raw ID.
-- The HMAC key is held by the application secret manager and is not stored here.
CREATE TABLE IF NOT EXISTS user_external_identity_links (
  id UUID PRIMARY KEY,
  source_system_code VARCHAR(48) NOT NULL
    CHECK (source_system_code ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  source_subject_hmac CHAR(64) NOT NULL
    CHECK (source_subject_hmac ~ '^[a-f0-9]{64}$'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_account_status VARCHAR(16) NOT NULL DEFAULT 'unknown'
    CHECK (source_account_status IN ('enabled','disabled','locked','unknown')),
  source_last_login_at TIMESTAMPTZ,
  source_payload_digest CHAR(64)
    CHECK (source_payload_digest IS NULL OR source_payload_digest ~ '^[a-f0-9]{64}$'),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  UNIQUE (source_system_code, source_subject_hmac)
);

CREATE INDEX IF NOT EXISTS idx_user_external_identity_user
  ON user_external_identity_links (user_id, source_system_code);

-- Per-record metadata only. No raw payload, email, display name, or source ID.
CREATE TABLE IF NOT EXISTS user_import_records (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES user_import_batches(id) ON DELETE RESTRICT,
  source_system_code VARCHAR(48) NOT NULL
    CHECK (source_system_code ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
  source_subject_hmac CHAR(64) NOT NULL
    CHECK (source_subject_hmac ~ '^[a-f0-9]{64}$'),
  payload_digest CHAR(64) NOT NULL
    CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  idempotency_key CHAR(64) NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'discovered'
    CHECK (status IN (
      'discovered','validated','conflict','rejected','ready',
      'provisioned','skipped','failed'
    )),
  target_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  safe_error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, source_system_code, source_subject_hmac)
);

CREATE INDEX IF NOT EXISTS idx_user_import_records_batch_status
  ON user_import_records (batch_id, status);
CREATE INDEX IF NOT EXISTS idx_user_import_records_target_user
  ON user_import_records (target_user_id)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_import_audit_events (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES user_import_batches(id) ON DELETE RESTRICT,
  record_id UUID REFERENCES user_import_records(id) ON DELETE RESTRICT,
  -- Immutable actor reference; no FK action may rewrite an audit event.
  actor_user_id UUID,
  event_code VARCHAR(48) NOT NULL,
  from_status VARCHAR(24),
  to_status VARCHAR(24),
  safe_reason_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_import_audit_batch_created
  ON user_import_audit_events (batch_id, created_at ASC);

CREATE OR REPLACE FUNCTION prevent_user_import_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'user import audit events are append-only';
END;
$function$;

DROP TRIGGER IF EXISTS trg_user_import_audit_events_append_only
  ON user_import_audit_events;
CREATE TRIGGER trg_user_import_audit_events_append_only
BEFORE UPDATE OR DELETE ON user_import_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_user_import_audit_event_mutation();
