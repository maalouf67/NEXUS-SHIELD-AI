import { Router } from 'express';
import { z } from 'zod';
import { runOrchestrator } from '../ai/orchestrator.js';
import { requireServiceToken } from '../middleware/service-token.js';
import { threatAnalysisRateLimiter } from '../middleware/ai-rate-limit.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { createRequireWorkspace, requireWorkspaceRole } from '../workspaces/workspace.middleware.js';
import { pool } from '../db/pool.js';

export const threatsRouter = Router();
const requireThreatSummaryWorkspace = createRequireWorkspace();
const ThreatRequestSchema = z.object({
  target: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(200),
  signal_type: z.string().trim().max(100).optional(),
  details: z.string().max(5000).optional()
});

threatsRouter.get('/threats/summary', requireAuth, requireThreatSummaryWorkspace, requireWorkspaceRole('admin', 'analyst', 'viewer'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total_incidents,
         COUNT(*) FILTER (
           WHERE severity = 'critical' AND status NOT IN ('resolved', 'closed')
         )::int AS critical,
         COUNT(*) FILTER (
           WHERE status IN ('contained', 'resolved', 'closed')
         )::int AS mitigated,
         COALESCE(MAX(updated_at), MAX(created_at), NOW()) AS updated_at
       FROM incidents
       WHERE workspace_id = $1`,
      [req.workspaceContext!.id]
    );
    const row = result.rows[0] ?? {};
    const updatedAt = row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : new Date(row.updated_at ?? Date.now()).toISOString();

    return res.status(200).json({
      status: 'ok',
      is_demo: false,
      data_source: 'postgresql',
      summary: {
        total_incidents: Number(row.total_incidents ?? 0),
        critical: Number(row.critical ?? 0),
        mitigated: Number(row.mitigated ?? 0),
        ai_score: null,
        updated_at: updatedAt
      }
    });
  } catch {
    return res.status(503).json({
      error: 'THREAT_SUMMARY_UNAVAILABLE',
      message: 'Threat summary could not be loaded from PostgreSQL.'
    });
  }
});

threatsRouter.post('/threats/analyze', requireServiceToken, threatAnalysisRateLimiter, async (req, res) => {
  const parsed = ThreatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });
  }

  try {
    const orchestration = await runOrchestrator({
      taskType: 'triage',
      complexity: 'medium',
      riskLevel: 'medium',
      prompt: parsed.data.details ?? '',
      context: {
        target: parsed.data.target,
        source: parsed.data.source,
        signal_type: parsed.data.signal_type ?? 'behavioral'
      },
      userId: req.header('x-nexus-user-id') ?? undefined
    });
    const analysis = orchestration.analysis as Record<string, unknown>;

    return res.json({
      status: 'success',
      provider: orchestration.provider,
      model: orchestration.modelId,
      target: parsed.data.target,
      source: parsed.data.source,
      ...analysis,
      routing: orchestration.routing,
      disclaimer: 'AI-generated assessment based only on supplied information. It is not proof of a confirmed security incident.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'AI_NOT_CONFIGURED' || message === 'AI_NO_PROVIDER_AVAILABLE') {
      return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
    }
    if (message === 'AI_RATE_LIMIT') return res.status(503).json({ error: 'AI_RATE_LIMIT' });
    if (message === 'AI_REFUSED' || message === 'AI_POLICY_BLOCKED') return res.status(422).json({ error: 'AI_REFUSED' });
    if (message === 'AI_AUTH_FAILED') return res.status(502).json({ error: 'AI_AUTH_FAILED' });
    if (message === 'AI_TIMEOUT' || (error instanceof Error && error.name === 'TimeoutError')) {
      return res.status(504).json({ error: 'AI_TIMEOUT' });
    }
    if (message === 'UNSUPPORTED_TASK' || message === 'INVALID_THREAT_CONTEXT') {
      return res.status(400).json({ error: message });
    }
    return res.status(502).json({ error: 'AI_ANALYSIS_FAILED' });
  }
});
