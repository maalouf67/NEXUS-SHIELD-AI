import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../auth/auth.middleware.js';
import {
  createRequireWorkspace,
  requireWorkspaceRole
} from '../workspaces/workspace.middleware.js';
import {
  workspaceRepository,
  type WorkspaceRepository
} from '../workspaces/workspace.repository.js';
import {
  submitSecurityTriage,
  type AgentTriageSubmission,
  type AgentPlatformResult
} from './agent-platform.client.js';

const SubmitTriageSchema = z.object({
  event_type: z.string().trim().min(1).max(256),
  source: z.string().trim().min(1).max(256),
  target: z.string().trim().min(1).max(256),
  details: z.string().trim().min(1).max(4000),
  observed_at: z.string().datetime({ offset: true }).optional()
}).strict();

type TriageSubmitter = (
  submission: AgentTriageSubmission
) => Promise<AgentPlatformResult>;

export function createAgentPlatformRouter(
  repository: WorkspaceRepository = workspaceRepository,
  submit: TriageSubmitter = submitSecurityTriage
) {
  const router = Router();
  const requireWorkspace = createRequireWorkspace(repository);

  router.post(
    '/agents/security-triage',
    requireAuth,
    requireWorkspace,
    requireWorkspaceRole('admin', 'analyst'),
    async (req, res) => {
      const parsed = SubmitTriageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          details: parsed.error.flatten()
        });
      }

      const workspace = req.workspaceContext;
      if (!workspace) {
        return res.status(428).json({ error: 'WORKSPACE_REQUIRED' });
      }

      const submission: AgentTriageSubmission = {
        tenant_id: workspace.id,
        task_id: `triage:${randomUUID()}`,
        event_type: parsed.data.event_type,
        source: parsed.data.source,
        target: parsed.data.target,
        details: parsed.data.details,
        observed_at: parsed.data.observed_at ?? new Date().toISOString()
      };

      try {
        const result = await submit(submission);
        if (result.tenant_id !== workspace.id ||
            result.task_id !== submission.task_id) {
          return res.status(502).json({ error: 'AGENT_PLATFORM_INVALID_RESPONSE' });
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ result });
      } catch {
        return res.status(503).json({ error: 'AGENT_PLATFORM_UNAVAILABLE' });
      }
    }
  );

  return router;
}

export const agentPlatformRouter = createAgentPlatformRouter();
