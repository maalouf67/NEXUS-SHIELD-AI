ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER(email)
    FROM users
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create normalized unique email index: duplicate email addresses differ only by case.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized
  ON users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_users_role_active
  ON users (role, is_active);
