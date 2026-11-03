import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const databaseSslEnabled = process.env.DATABASE_SSL !== 'false';
const configuredCaPath = process.env.DATABASE_SSL_CA_PATH?.trim();

const databaseSsl = databaseSslEnabled
  ? {
      ca: configuredCaPath
        ? readFileSync(resolve(configuredCaPath), 'utf8')
        : readFileSync(new URL('../../certs/supabase-ca.crt', import.meta.url), 'utf8'),
      rejectUnauthorized: true
    }
  : false;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSsl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT NOW() AS connected_at');
  return result.rows[0];
}
