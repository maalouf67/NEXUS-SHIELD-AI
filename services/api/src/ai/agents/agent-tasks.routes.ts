import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../auth/auth.middleware.js';
import { pool } from '../../db/pool.js';
import { nexusSupervisor, type NexusSupervisor } from './supervisor.runtime.js';
import type { AgentSecurityEvent } from './threat-intelligence.agent.js';
import { createRequireWorkspace, requireWorkspaceRole } from '../../workspaces/workspace.middleware.js';

const TaskRequestSchema = z.object({
  agentId: z.literal('threat-intelligence'),
  securityEventId: z.string().uuid()
}).strict();

type FindWorkspaceEvent = (workspaceId: string, eventId: string) => Promise<AgentSecurityEvent | null>;

async function findWorkspaceEvent(workspaceId: string, eventId: string): Promise<AgentSecurityEvent | null> {
  const result = await pool.query<{
    id: string;
    source: string;
    event_type: string;
    severity: AgentSecurityEvent['severity'];
    observed_at: Date | string;
    asset_id: string | null;
    summary: string;
    attributes: Record<string, string> | null;
  }>(
    `SELECT id, source, event_type, severity, observed_at, asset_id, summary, attributes
       FROM security_events
      WHERE workspace_id = $1 AND id = $2
      LIMIT 1`,
    [workspaceId, eventId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    eventType: row.event_type,
    severity: row.severity,
    observedAt: row.observed_at instanceof Date ? row.observed_at.toISOString() : new Date(row.observed_at).toISOString(),
    assetId: row.asset_id,
    summary: row.summary,
    attributes: row.attributes ?? {}
  };
}

export function createAgentTasksRouter(options: {
  requireAuthentication?: RequestHandler;
  requireWorkspace?: RequestHandler;
  findEvent?: FindWorkspaceEvent;
  supervisor?: { executeThreatIntelligenceTask: (input: Parameters<NexusSupervisor['executeThreatIntelligenceTask']>[0]) => Promise<unknown> };
} = {}) {
  const router = Router();
  const authenticate = options.requireAuthentication ?? requireAuth;
  const workspace = options.requireWorkspace ?? createRequireWorkspace();
  const loadEvent = options.findEvent ?? findWorkspaceEvent;
  const supervisor = options.supervisor ?? nexusSupervisor;

  router.post(
    '/agents/tasks',
    authenticate,
    workspace,
    requireWorkspaceRole('admin', 'analyst'),
    async (req, res) => {
      const parsed = TaskRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'INVALID_AGENT_TASK',
          details: parsed.error.flatten()
        });
      }

      const workspaceId = req.workspaceContext!.id;
      try {
        const event = await loadEvent(workspaceId, parsed.data.securityEventId);
        if (!event) return res.status(404).json({ error: 'SECURITY_EVENT_NOT_FOUND' });

        const result = await supervisor.executeThreatIntelligenceTask({
          workspaceId,
          actorUserId: req.authUser!.id,
          event,
          taskId: randomUUID(),
          correlationId: randomUUID()
        });
        return res.status(200).json({
          status: 'completed',
          task: result,
          execution_mode: 'synchronous',
          side_effects: false,
          note: 'Read-only AI analysis of one event in the authenticated workspace. No containment or configuration changes were performed.'
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'AGENT_EXECUTION_FAILED';
        if (code === 'AI_NOT_CONFIGURED' || code === 'AI_NO_PROVIDER_AVAILABLE') {
          return res.status(503).json({ error: 'AI_PROVIDER_UNAVAILABLE' });
        }
        if (code === 'AGENT_DEADLINE_EXPIRED') {
          return res.status(504).json({ error: 'AGENT_DEADLINE_EXPIRED' });
        }
        return res.status(502).json({ error: 'AGENT_EXECUTION_FAILED' });
      }
    }
  );

  return router;
}

export const agentTasksRouter = createAgentTasksRouter();
