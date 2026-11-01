import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const supabaseCA = readFileSync(
  new URL('../../certs/supabase-ca.crt', import.meta.url),
  'utf8'
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: supabaseCA,
    rejectUnauthorized: true
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT NOW() AS connected_at');
  return result.rows[0];
}
