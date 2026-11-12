import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { authTokenConfig } from '../auth/auth.middleware.js';
import { registerTestAuthSession } from '../auth/auth-session.repository.js';
import {
  createWorkspacesRouter
} from '../workspaces/workspaces.routes.js';
import {
  createRequireWorkspaceIntegration
} from '../workspaces/workspace.middleware.js';
import {
  hashWorkspaceIntegrationToken,
  type WorkspaceRepository,
  type WorkspaceMembership,
  type WorkspaceIntegration
} from '../workspaces/workspace.repository.js';

const SECRET = 'nexus-workspace-test-secret-at-least-32-characters';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
const VIEWER_ID = '550e8400-e29b-41d4-a716-446655440002';
const WORKSPACE_ID = '650e8400-e29b-41d4-a716-446655440000';
const originalSecret = process.env.JWT_SECRET;

function makeRepository(
  membership: WorkspaceMembership | null = {
    id: WORKSPACE_ID,
    name: 'Workspace A',
    slug: 'workspace-a-test',
    role: 'admin'
  }
): WorkspaceRepository {
  return {
    async createWorkspace(input) {
      return { id: input.id, name: input.name, slug: input.slug, role: 'admin' };
    },
    async listForUser() {
      return membership ? [membership] : [];
    },
    async findActiveMembership() {
      return membership;
    },
    async listMembers() {
      return [{
        id: ADMIN_ID,
        email: 'admin@example.test',
        role: 'admin',
        status: 'active',
        createdAt: '2026-11-08T00:00:00.000Z'
      }];
    },
    async addMemberByEmail(_workspaceId, email, role) {
      return {
        id: VIEWER_ID,
        email,
        role,
        status: 'active',
        createdAt: '2026-11-08T00:00:00.000Z'
      };
    },
    async updateMemberRole(_workspaceId, userId, role) {
      return {
        outcome: 'updated',
        member: {
          id: userId,
          email: 'member@example.test',
          role,
          status: 'active',
          createdAt: '2026-11-08T00:00:00.000Z'
        }
      };
    },
    async revokeMember(_workspaceId, userId) {
      return {
        outcome: 'revoked',
        member: {
          id: userId,
          email: 'member@example.test',
          role: 'analyst',
          status: 'revoked',
          createdAt: '2026-11-08T00:00:00.000Z'
        }
      };
    },
    async createIntegration(input) {
      return {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        name: input.name,
        permissions: input.permissions,
        token: 'synthetic-unit-test-token-that-is-long-enough'
      };
    },
    async findActiveIntegrationByHash() {
      return null;
    },
    async revokeIntegration() {
      return true;
    }
  };
}

function accessToken(userId: string, role: 'admin' | 'viewer' = 'admin') {
  const sessionId = randomUUID();
  registerTestAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    testIdentity: {
      id: userId,
      email: role + '@example.test',
      role
    }
  });
  return jwt.sign({ jti: sessionId }, SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: authTokenConfig.issuer,
    audience: authTokenConfig.audience,
    expiresIn: '15m'
  });
}

function appWith(repository: WorkspaceRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api', createWorkspacesRouter(repository));
  return app;
}

describe('Workspace identity and access controls', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('lists only workspaces returned for the authenticated account', async () => {
    const token = accessToken(ADMIN_ID);
    const response = await request(appWith(makeRepository()))
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.workspaces).toEqual([{
      id: WORKSPACE_ID,
      name: 'Workspace A',
      slug: 'workspace-a-test',
      role: 'admin'
    }]);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('creates a workspace with the authenticated account as its initial workspace administrator', async () => {
    const token = accessToken(ADMIN_ID);
    const response = await request(appWith(makeRepository()))
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Security Operations' });

    expect(response.status).toBe(201);
    expect(response.body.workspace.name).toBe('Security Operations');
    expect(response.body.workspace.role).toBe('admin');
    expect(response.body.workspace.slug).toMatch(/^security-operations-[a-f0-9-]{8}$/);
  });

  it('requires a workspace selector for workspace membership operations', async () => {
    const token = accessToken(ADMIN_ID);
    const response = await request(appWith(makeRepository()))
      .get('/api/workspaces/members')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(428);
    expect(response.body.error).toBe('WORKSPACE_REQUIRED');
  });

  it('denies a user who is not an active member of the selected workspace', async () => {
    const token = accessToken(ADMIN_ID);
    const response = await request(appWith(makeRepository(null)))
      .get('/api/workspaces/members')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('WORKSPACE_ACCESS_DENIED');
  });

  it('does not let a global administrator role bypass workspace membership role checks', async () => {
    const token = accessToken(ADMIN_ID);
    const viewerMembership: WorkspaceMembership = {
      id: WORKSPACE_ID,
      name: 'Workspace A',
      slug: 'workspace-a-test',
      role: 'viewer'
    };
    const response = await request(appWith(makeRepository(viewerMembership)))
      .get('/api/workspaces/members')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });


  it('allows a workspace administrator to change a member role', async () => {
    const token = accessToken(ADMIN_ID);
    const response = await request(appWith(makeRepository()))
      .patch(`/api/workspaces/members/${VIEWER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID)
      .send({ role: 'analyst' });

    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);
    expect(response.body.member).toMatchObject({ id: VIEWER_ID, role: 'analyst', status: 'active' });
  });

  it('allows a workspace administrator to revoke an active member', async () => {
    const token = accessToken(ADMIN_ID);
    const response = await request(appWith(makeRepository()))
      .delete(`/api/workspaces/members/${VIEWER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.member).toMatchObject({ id: VIEWER_ID, status: 'revoked' });
  });

  it('prevents a workspace viewer from changing or revoking memberships', async () => {
    const viewerMembership: WorkspaceMembership = {
      id: WORKSPACE_ID,
      name: 'Workspace A',
      slug: 'workspace-a-test',
      role: 'viewer'
    };
    const token = accessToken(ADMIN_ID);
    const app = appWith(makeRepository(viewerMembership));

    const roleChange = await request(app)
      .patch(`/api/workspaces/members/${VIEWER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID)
      .send({ role: 'admin' });
    expect(roleChange.status).toBe(403);

    const revoke = await request(app)
      .delete(`/api/workspaces/members/${VIEWER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID);
    expect(revoke.status).toBe(403);
  });

  it('preserves the final workspace administrator', async () => {
    const token = accessToken(ADMIN_ID);
    const repository = makeRepository();
    repository.revokeMember = async () => ({ outcome: 'last_admin' });
    const response = await request(appWith(repository))
      .delete(`/api/workspaces/members/${ADMIN_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('LAST_WORKSPACE_ADMIN');
  });

  it('rejects malformed member IDs and role payloads', async () => {
    const token = accessToken(ADMIN_ID);
    const app = appWith(makeRepository());

    const invalidId = await request(app)
      .delete('/api/workspaces/members/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID);
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error).toBe('INVALID_MEMBER_ID');

    const invalidRole = await request(app)
      .patch(`/api/workspaces/members/${VIEWER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-NEXUS-WORKSPACE-ID', WORKSPACE_ID)
      .send({ role: 'owner', isAdmin: true });
    expect(invalidRole.status).toBe(400);
    expect(invalidRole.body.error).toBe('INVALID_REQUEST');
  });

  it('hashes integration credentials before lookup and requires the requested permission', async () => {
    const tokenValue = 'test-workspace-integration-secret-value-123456';
    const repository = makeRepository();
    repository.findActiveIntegrationByHash = async (tokenHash: string): Promise<WorkspaceIntegration | null> => {
      expect(tokenHash).toBe(hashWorkspaceIntegrationToken(tokenValue));
      return {
        id: randomUUID(),
        workspaceId: WORKSPACE_ID,
        name: 'events-only',
        permissions: ['events:write']
      };
    };
    const app = express();
    app.get('/protected', createRequireWorkspaceIntegration('assets:read', repository), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const denied = await request(app)
      .get('/protected')
      .set('X-NEXUS-INTEGRATION-TOKEN', tokenValue);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('INTEGRATION_PERMISSION_DENIED');
  });
});
