import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

type DatabaseSslEnvironment = Pick<
  NodeJS.ProcessEnv,
  'DATABASE_SSL' | 'DATABASE_SSL_CA_PATH' | 'DATABASE_URL'
>;

function isSupabaseDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith('.supabase.co') ||
      hostname.endsWith('.pooler.supabase.com');
  } catch {
    return false;
  }
}

/**
 * Use an explicitly supplied CA when configured. The bundled Supabase CA is
 * selected only for Supabase database hostnames. Other managed PostgreSQL
 * providers use Node's system trust store by default. Certificate validation
 * is never disabled by this helper.
 */
export function createDatabaseSslOptions(
  environment: DatabaseSslEnvironment = process.env
): false | { rejectUnauthorized: true; ca?: string } {
  if (environment.DATABASE_SSL === 'false') return false;

  const configuredCaPath = environment.DATABASE_SSL_CA_PATH?.trim();
  if (configuredCaPath) {
    return {
      ca: readFileSync(resolve(configuredCaPath), 'utf8'),
      rejectUnauthorized: true
    };
  }

  if (isSupabaseDatabaseUrl(environment.DATABASE_URL)) {
    return {
      ca: readFileSync(new URL('../../certs/supabase-ca.crt', import.meta.url), 'utf8'),
      rejectUnauthorized: true
    };
  }

  // With no explicit CA, Node uses its built-in/system trusted root CAs.
  return { rejectUnauthorized: true };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: createDatabaseSslOptions(),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT NOW() AS connected_at');
  return result.rows[0];
}
