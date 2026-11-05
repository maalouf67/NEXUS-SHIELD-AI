import 'dotenv/config';

import { checkDatabaseConnection, pool } from '../db/pool.js';

async function main() {
  try {
    const result = await checkDatabaseConnection();
    const connectedAt = result.connected_at instanceof Date
      ? result.connected_at.toISOString()
      : new Date(result.connected_at).toISOString();
    console.log(`PostgreSQL connection verified at ${connectedAt}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown database connection error.';
  console.error(`PostgreSQL connection check failed: ${message}`);
  process.exitCode = 1;
});
