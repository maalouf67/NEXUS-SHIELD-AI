import 'dotenv/config';

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';

import { pool } from '../db/pool.js';

const MIGRATION_LOCK_NAMESPACE = 728194;
const MIGRATION_LOCK_NAME = 'nexus-shield-ai-database-migrations';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function readMigrations() {
  const directory = resolve(fileURLToPath(new URL('../../../../database/init/', import.meta.url)));
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (names.length === 0) {
    throw new Error('No numbered SQL migrations were found in database/init.');
  }

  return Promise.all(names.map(async (name) => {
    const content = await readFile(resolve(directory, name), 'utf8');
    return { version: name, content, checksum: sha256(content) };
  }));
}

async function applyMigrations(client: PoolClient) {
  const migrations = await readMigrations();

  await client.query(
    `CREATE TABLE IF NOT EXISTS nexus_schema_migrations (
       version VARCHAR(255) PRIMARY KEY,
       checksum CHAR(64) NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  let applied = 0;
  let unchanged = 0;

  for (const migration of migrations) {
    const recorded = await client.query<{ checksum: string }>(
      'SELECT checksum FROM nexus_schema_migrations WHERE version = $1',
      [migration.version]
    );
    const existingChecksum = recorded.rows[0]?.checksum?.trim();

    if (existingChecksum) {
      if (existingChecksum !== migration.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.version}. Do not edit an applied migration; add a new numbered migration instead.`
        );
      }
      unchanged += 1;
      continue;
    }

    await client.query('BEGIN');
    try {
      // These migration files contain trusted, repository-owned DDL. They are
      // executed without parameters so PostgreSQL can process the full SQL file.
      await client.query(migration.content);
      await client.query(
        'INSERT INTO nexus_schema_migrations (version, checksum) VALUES ($1, $2)',
        [migration.version, migration.checksum]
      );
      await client.query('COMMIT');
      applied += 1;
      console.log(`Applied database migration: ${migration.version}`);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the migration failure.
      }
      throw error;
    }
  }

  return { applied, unchanged, total: migrations.length };
}

async function main() {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1, hashtext($2))', [
      MIGRATION_LOCK_NAMESPACE,
      MIGRATION_LOCK_NAME
    ]);
    lockAcquired = true;

    const result = await applyMigrations(client);
    console.log(
      `Database migrations complete: ${result.applied} applied, ${result.unchanged} already current, ${result.total} total.`
    );
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1, hashtext($2))', [
          MIGRATION_LOCK_NAMESPACE,
          MIGRATION_LOCK_NAME
        ]);
      } catch {
        // Releasing the session also releases any advisory lock.
      }
    }
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown database migration error.';
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});
