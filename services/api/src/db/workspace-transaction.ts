import type { PoolClient } from 'pg';
import { pool } from './pool.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run workspace-scoped database work on one checked-out connection.
 *
 * app.workspace_id is transaction-local (set_config(..., true)), so it is
 * automatically cleared on COMMIT/ROLLBACK before the pooled connection is
 * returned to another request. RLS policies can consume this setting once
 * their table coverage and service-job access paths have been audited.
 */
export async function withWorkspaceTransaction<T>(
  workspaceId: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!UUID_PATTERN.test(workspaceId)) {
    throw new TypeError('A valid workspace UUID is required.');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(
      "SELECT set_config('app.workspace_id', $1, true)",
      [workspaceId]
    );

    const result = await operation(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original operation/transaction error.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
