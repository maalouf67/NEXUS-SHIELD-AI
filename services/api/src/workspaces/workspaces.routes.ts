import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware.js';
import { createRequireWorkspace, requireWorkspaceRole } from './workspace.middleware.js';
import {
  workspaceRepository,
  WorkspaceAuthorizationError,
  type WorkspaceRepository,
  type WorkspaceRole,
  type WorkspaceIntegrationPermission
} from './workspace.repository.js';

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120)
}).strict();

const AddMemberSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(['admin', 'analyst', 'viewer'])
}).strict();

const CreateIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  permissions: z.array(z.enum(['assets:read', 'assets:write', 'events:write'])).min(1).max(3)
}).strict().superRefine((value, context) => {
  if (new Set(value.permissions).size !== value.permissions.length) {
    context.addIssue({ code: 'custom', path: ['permissions'], message: 'Permissions must be unique.' });
  }
});

function slugBase(name: string): string {
  return name.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || 'workspace';
}

export function createWorkspacesRouter(repository: WorkspaceRepository = workspaceRepository) {
  const router = Router();
  const requireWorkspace = createRequireWorkspace(repository);

  router.get('/workspaces', requireAuth, async (req, res) => {
    try {
      const workspaces = await repository.listForUser(req.authUser!.id);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ workspaces });
    } catch {
      return res.status(503).json({ error: 'WORKSPACE_STORE_UNAVAILABLE' });
    }
  });

  router.post('/workspaces', requireAuth, async (req, res) => {
    const parsed = CreateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    const name = parsed.data.name;
    const slug = `${slugBase(name)}-${randomUUID().slice(0, 8)}`;
    try {
      const workspace = await repository.createWorkspace({
        id: randomUUID(),
        name,
        slug,
        ownerUserId: req.authUser!.id
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ workspace });
    } catch {
      return res.status(503).json({ error: 'WORKSPACE_STORE_UNAVAILABLE' });
    }
  });

  router.get('/workspaces/members', requireAuth, requireWorkspace, requireWorkspaceRole('admin'), async (req, res) => {
    try {
      const members = await repository.listMembers(req.workspaceContext!.id);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ members });
    } catch {
      return res.status(503).json({ error: 'WORKSPACE_MEMBER_STORE_UNAVAILABLE' });
    }
  });

  router.post('/workspaces/members', requireAuth, requireWorkspace, requireWorkspaceRole('admin'), async (req, res) => {
    const parsed = AddMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    try {
      const member = await repository.addMemberByEmail(
        req.workspaceContext!.id,
        parsed.data.email,
        parsed.data.role as WorkspaceRole,
        req.authUser!.id
      );
      if (!member) return res.status(404).json({ error: 'ACTIVE_USER_NOT_FOUND' });
      return res.status(200).json({ member });
    } catch (error) {
      if (error instanceof WorkspaceAuthorizationError) {
        return res.status(403).json({ error: 'WORKSPACE_ADMIN_REQUIRED' });
      }
      return res.status(503).json({ error: 'WORKSPACE_MEMBER_STORE_UNAVAILABLE' });
    }
  });

  router.post('/workspaces/integrations', requireAuth, requireWorkspace, requireWorkspaceRole('admin'), async (req, res) => {
    const parsed = CreateIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
    }
    try {
      const integration = await repository.createIntegration({
        workspaceId: req.workspaceContext!.id,
        name: parsed.data.name,
        permissions: parsed.data.permissions as WorkspaceIntegrationPermission[],
        actorUserId: req.authUser!.id
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ integration });
    } catch (error) {
      if (error instanceof WorkspaceAuthorizationError) {
        return res.status(403).json({ error: 'WORKSPACE_ADMIN_REQUIRED' });
      }
      return res.status(503).json({ error: 'WORKSPACE_INTEGRATION_STORE_UNAVAILABLE' });
    }
  });

  router.delete('/workspaces/integrations/:integrationId', requireAuth, requireWorkspace, requireWorkspaceRole('admin'), async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.integrationId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_INTEGRATION_ID' });
    try {
      const revoked = await repository.revokeIntegration(req.workspaceContext!.id, id.data, req.authUser!.id);
      return revoked
        ? res.status(200).json({ success: true })
        : res.status(404).json({ error: 'INTEGRATION_NOT_FOUND' });
    } catch (error) {
      if (error instanceof WorkspaceAuthorizationError) {
        return res.status(403).json({ error: 'WORKSPACE_ADMIN_REQUIRED' });
      }
      return res.status(503).json({ error: 'WORKSPACE_INTEGRATION_STORE_UNAVAILABLE' });
    }
  });

  return router;
}

export const workspacesRouter = createWorkspacesRouter();
