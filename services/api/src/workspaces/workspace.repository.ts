import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

export type WorkspaceRole = 'admin' | 'analyst' | 'viewer';
export type WorkspaceStatus = 'active' | 'suspended' | 'closed';
export type WorkspaceIntegrationPermission = 'assets:read' | 'assets:write' | 'events:write';

export interface WorkspaceMembership {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: 'active' | 'invited' | 'revoked';
  createdAt: string;
}

export interface WorkspaceIntegration {
  id: string;
  workspaceId: string;
  name: string;
  permissions: WorkspaceIntegrationPermission[];
}

export interface CreatedWorkspaceIntegration extends WorkspaceIntegration {
  token: string;
}

export interface WorkspaceRepository {
  createWorkspace(input: { id: string; name: string; slug: string; ownerUserId: string }): Promise<WorkspaceMembership>;
  listForUser(userId: string): Promise<WorkspaceMembership[]>;
  findActiveMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  addMemberByEmail(workspaceId: string, email: string, role: WorkspaceRole, actorUserId: string): Promise<WorkspaceMember | null>;
  createIntegration(input: { workspaceId: string; name: string; permissions: WorkspaceIntegrationPermission[]; actorUserId: string }): Promise<CreatedWorkspaceIntegration>;
  findActiveIntegrationByHash(tokenHash: string): Promise<WorkspaceIntegration | null>;
  revokeIntegration(workspaceId: string, integrationId: string, actorUserId: string): Promise<boolean>;
}

export class WorkspaceAuthorizationError extends Error {
  constructor() {
    super('An active workspace administrator membership is required.');
    this.name = 'WorkspaceAuthorizationError';
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function requireActiveWorkspaceAdmin(
  client: import('pg').PoolClient,
  workspaceId: string,
  actorUserId: string
): Promise<void> {
  // Lock the actor membership and workspace to serialize privileged writes
  // against concurrent membership revocation and workspace suspension.
  const result = await client.query(
    `SELECT m.role
     FROM workspace_memberships m
     INNER JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.workspace_id = $1
       AND m.user_id = $2
       AND m.status = 'active'
       AND w.status = 'active'
     FOR UPDATE OF m, w`,
    [workspaceId, actorUserId]
  );
  if (result.rows[0]?.role !== 'admin') throw new WorkspaceAuthorizationError();
}

async function appendWorkspaceAudit(
  client: import('pg').PoolClient,
  input: {
    workspaceId: string;
    actorUserId: string;
    action: 'workspace.member.added' | 'workspace.integration.created' | 'workspace.integration.revoked';
    targetType: 'membership' | 'integration';
    targetId: string;
    metadata?: Record<string, string | number | boolean>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO workspace_audit_logs
       (id, workspace_id, actor_user_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      randomUUID(),
      input.workspaceId,
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export function hashWorkspaceIntegrationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  async createWorkspace(input: { id: string; name: string; slug: string; ownerUserId: string }): Promise<WorkspaceMembership> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const workspace = await client.query(
        `INSERT INTO workspaces (id, name, slug, created_by_user_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug`,
        [input.id, input.name, input.slug, input.ownerUserId]
      );
      await client.query(
        `INSERT INTO workspace_memberships
           (workspace_id, user_id, role, status, created_by_user_id)
         VALUES ($1, $2, 'admin', 'active', $2)`,
        [input.id, input.ownerUserId]
      );
      await client.query('COMMIT');
      return {
        id: workspace.rows[0].id,
        name: workspace.rows[0].name,
        slug: workspace.rows[0].slug,
        role: 'admin'
      };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    const result = await pool.query(
      `SELECT w.id, w.name, w.slug, m.role
       FROM workspace_memberships m
       INNER JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
         AND m.status = 'active'
         AND w.status = 'active'
       ORDER BY w.name ASC, w.id ASC`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      role: row.role as WorkspaceRole
    }));
  }

  async findActiveMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null> {
    const result = await pool.query(
      `SELECT w.id, w.name, w.slug, m.role
       FROM workspace_memberships m
       INNER JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
         AND m.workspace_id = $2
         AND m.status = 'active'
         AND w.status = 'active'
       LIMIT 1`,
      [userId, workspaceId]
    );
    const row = result.rows[0];
    return row ? {
      id: row.id,
      name: row.name,
      slug: row.slug,
      role: row.role as WorkspaceRole
    } : null;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const result = await pool.query(
      `SELECT u.id, u.email, m.role, m.status, m.created_at
       FROM workspace_memberships m
       INNER JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1
       ORDER BY CASE m.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
                u.email ASC`,
      [workspaceId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as WorkspaceRole,
      status: row.status as WorkspaceMember['status'],
      createdAt: iso(row.created_at)
    }));
  }

  async addMemberByEmail(
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
    actorUserId: string
  ): Promise<WorkspaceMember | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await requireActiveWorkspaceAdmin(client, workspaceId, actorUserId);
      const user = await client.query(
        'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE LIMIT 1',
        [email]
      );
      if (!user.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }

      const inserted = await client.query(
        `INSERT INTO workspace_memberships
           (workspace_id, user_id, role, status, created_by_user_id)
         VALUES ($1, $2, $3, 'active', $4)
         ON CONFLICT (workspace_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'active', revoked_at = NULL,
               created_by_user_id = EXCLUDED.created_by_user_id
         WHERE workspace_memberships.status = 'revoked'
         RETURNING user_id, role, status, created_at`,
        [workspaceId, user.rows[0].id, role, actorUserId]
      );
      if (!inserted.rowCount) {
        await client.query('ROLLBACK');
        const existing = await client.query(
          `SELECT user_id, role, status, created_at
           FROM workspace_memberships
           WHERE workspace_id = $1 AND user_id = $2`,
          [workspaceId, user.rows[0].id]
        );
        const row = existing.rows[0];
        return row ? {
          id: row.user_id,
          email: user.rows[0].email,
          role: row.role as WorkspaceRole,
          status: row.status as WorkspaceMember['status'],
          createdAt: iso(row.created_at)
        } : null;
      }
      await appendWorkspaceAudit(client, {
        workspaceId,
        actorUserId,
        action: 'workspace.member.added',
        targetType: 'membership',
        targetId: inserted.rows[0].user_id,
        metadata: { role: inserted.rows[0].role as WorkspaceRole }
      });
      await client.query('COMMIT');
      return {
        id: inserted.rows[0].user_id,
        email: user.rows[0].email,
        role: inserted.rows[0].role as WorkspaceRole,
        status: inserted.rows[0].status as WorkspaceMember['status'],
        createdAt: iso(inserted.rows[0].created_at)
      };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async createIntegration(input: {
    workspaceId: string;
    name: string;
    permissions: WorkspaceIntegrationPermission[];
    actorUserId: string;
  }): Promise<CreatedWorkspaceIntegration> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashWorkspaceIntegrationToken(token);
    const id = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await requireActiveWorkspaceAdmin(client, input.workspaceId, input.actorUserId);
      await client.query(
        `INSERT INTO workspace_integrations
           (id, workspace_id, name, token_hash, permissions, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, input.workspaceId, input.name, tokenHash, input.permissions, input.actorUserId]
      );
      await appendWorkspaceAudit(client, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: 'workspace.integration.created',
        targetType: 'integration',
        targetId: id,
        metadata: { name: input.name, permissions: input.permissions.join(',') }
      });
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
    return {
      id,
      workspaceId: input.workspaceId,
      name: input.name,
      permissions: input.permissions,
      token
    };
  }

  async findActiveIntegrationByHash(tokenHash: string): Promise<WorkspaceIntegration | null> {
    const result = await pool.query(
      `UPDATE workspace_integrations i
       SET last_used_at = NOW()
       FROM workspaces w
       WHERE i.token_hash = $1
         AND i.workspace_id = w.id
         AND i.status = 'active'
         AND w.status = 'active'
       RETURNING i.id, i.workspace_id, i.name, i.permissions`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      permissions: row.permissions as WorkspaceIntegrationPermission[]
    } : null;
  }

  async revokeIntegration(workspaceId: string, integrationId: string, actorUserId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await requireActiveWorkspaceAdmin(client, workspaceId, actorUserId);
      const result = await client.query(
        `UPDATE workspace_integrations
         SET status = 'revoked', revoked_at = NOW()
         WHERE workspace_id = $1 AND id = $2 AND status = 'active'
         RETURNING id`,
        [workspaceId, integrationId]
      );
      if (result.rowCount) {
        await appendWorkspaceAudit(client, {
          workspaceId,
          actorUserId,
          action: 'workspace.integration.revoked',
          targetType: 'integration',
          targetId: integrationId
        });
      }
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const workspaceRepository: WorkspaceRepository = new PostgresWorkspaceRepository();
