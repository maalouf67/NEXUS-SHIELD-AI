import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import {
  hashWorkspaceIntegrationToken,
  workspaceRepository,
  type WorkspaceIntegrationPermission,
  type WorkspaceRepository
} from './workspace.repository.js';

export interface WorkspaceContext {
  id: string;
  name: string;
  slug: string;
  role: 'admin' | 'analyst' | 'viewer';
}

export interface WorkspaceIntegrationContext {
  id: string;
  workspaceId: string;
  name: string;
  permissions: WorkspaceIntegrationPermission[];
}

declare global {
  namespace Express {
    interface Request {
      workspaceContext?: WorkspaceContext;
      workspaceIntegration?: WorkspaceIntegrationContext;
    }
  }
}

const UUID = z.string().uuid();

export function createRequireWorkspace(
  repository: WorkspaceRepository = workspaceRepository
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    const rawWorkspaceId = req.header('x-nexus-workspace-id')?.trim();
    if (!rawWorkspaceId) {
      return res.status(428).json({
        error: 'WORKSPACE_REQUIRED',
        message: 'Select an active workspace before accessing workspace data.'
      });
    }
    const parsed = UUID.safeParse(rawWorkspaceId);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_WORKSPACE_ID' });
    }

    void repository.findActiveMembership(req.authUser.id, parsed.data)
      .then((membership) => {
        if (!membership) {
          res.status(403).json({ error: 'WORKSPACE_ACCESS_DENIED' });
          return;
        }
        req.workspaceContext = membership;
        next();
      })
      .catch(() => {
        res.status(503).json({ error: 'WORKSPACE_ACCESS_UNAVAILABLE' });
      });
  };
}

export function requireWorkspaceRole(...allowedRoles: WorkspaceContext['role'][]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.workspaceContext) {
      return res.status(428).json({ error: 'WORKSPACE_REQUIRED' });
    }
    if (!allowedRoles.includes(req.workspaceContext.role)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    return next();
  };
}

export function createRequireWorkspaceIntegration(
  permission: WorkspaceIntegrationPermission,
  repository: WorkspaceRepository = workspaceRepository
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('x-nexus-integration-token')?.trim();
    if (!token || token.length < 32 || token.length > 256) {
      return res.status(401).json({ error: 'INVALID_INTEGRATION_CREDENTIALS' });
    }

    void repository.findActiveIntegrationByHash(hashWorkspaceIntegrationToken(token))
      .then((integration) => {
        if (!integration) {
          res.status(401).json({ error: 'INVALID_INTEGRATION_CREDENTIALS' });
          return;
        }
        if (!integration.permissions.includes(permission)) {
          res.status(403).json({ error: 'INTEGRATION_PERMISSION_DENIED' });
          return;
        }
        req.workspaceIntegration = integration;
        next();
      })
      .catch(() => {
        res.status(503).json({ error: 'INTEGRATION_AUTH_UNAVAILABLE' });
      });
  };
}
