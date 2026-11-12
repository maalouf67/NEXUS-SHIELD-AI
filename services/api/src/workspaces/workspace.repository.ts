import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

export type WorkspaceRole = 'admin' | 'analyst' | 'viewer';
export type WorkspaceStatus = 'active' | 'suspended' | 'closed';
export type WorkspaceIntegrationPermission = 'assets:read' | 'assets:write' | 'events:write';
export type WorkspaceMembershipRevocationResult = 'revoked' | 'not_found' | 'last_admin';

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
  revokedAt: string | null;
  revokedByUserId: string | null;
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
  revokeMembership(workspaceId: string, userId: string, actorUserId: string): Promise<WorkspaceMembershipRevocationResult>;
  createIntegration(input: { workspaceId: string; name: string; permissions: WorkspaceIntegrationPermission[]; actorUserId: string }): Promise<CreatedWorkspaceIntegration>;
  findActiveIntegrationByHash(tokenHash: string): Promise<WorkspaceIntegration | null>;
  revokeIntegration(workspaceId: string, integrationId: string): Promise<boolean>;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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
      `SELECT u.id, u.email, m.role, m.status, m.created_at, m.revoked_at, m.revoked_by_user_id
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
      createdAt: iso(row.created_at),
      revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
      revokedByUserId: row.revoked_by_user_id ?? null
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
               revoked_by_user_id = NULL,
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

  async revokeMembership(
    workspaceId: string,
    userId: string,
    actorUserId: string
  ): Promise<WorkspaceMembershipRevocationResult> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize revocations within a workspace to protect its final active administrator.
      const workspace = await client.query(
        "SELECT id FROM workspaces WHERE id = $1 AND status = 'active' FOR UPDATE",
        [workspaceId]
      );
      if (!workspace.rowCount) {
        await client.query('ROLLBACK');
        return 'not_found';
      }

      const membership = await client.query(
        "SELECT role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE",
        [workspaceId, userId]
      );
      if (!membership.rowCount) {
        await client.query('ROLLBACK');
        return 'not_found';
      }

      if (membership.rows[0].role === 'admin') {
        const administrators = await client.query(
          "SELECT COUNT(*)::int AS total FROM workspace_memberships WHERE workspace_id = $1 AND role = 'admin' AND status = 'active'",
          [workspaceId]
        );
        if ((administrators.rows[0]?.total ?? 0) <= 1) {
          await client.query('ROLLBACK');
          return 'last_admin';
        }
      }

      const revoked = await client.query(
        "UPDATE workspace_memberships SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = $3 WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' RETURNING user_id",
        [workspaceId, userId, actorUserId]
      );
      await client.query('COMMIT');
      return (revoked.rowCount ?? 0) > 0 ? 'revoked' : 'not_found';
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
    await pool.query(
      `INSERT INTO workspace_integrations
         (id, workspace_id, name, token_hash, permissions, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, input.workspaceId, input.name, tokenHash, input.permissions, input.actorUserId]
    );
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

  async revokeIntegration(workspaceId: string, integrationId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE workspace_integrations
       SET status = 'revoked', revoked_at = NOW()
       WHERE workspace_id = $1 AND id = $2 AND status = 'active'
       RETURNING id`,
      [workspaceId, integrationId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const workspaceRepository: WorkspaceRepository = new PostgresWorkspaceRepository();
