import type { PoolClient } from 'pg';
import { pool } from './pool.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Execute workspace data access with a transaction-local PostgreSQL RLS context. */
export async function withWorkspaceTransaction<T>(
  workspaceId: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!UUID.test(workspaceId)) throw new Error('INVALID_WORKSPACE_ID');

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SELECT set_config('app.workspace_id', $1, TRUE)", [workspaceId]);
    const result = await operation(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try { await client.query('ROLLBACK'); } catch { /* preserve the original error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
