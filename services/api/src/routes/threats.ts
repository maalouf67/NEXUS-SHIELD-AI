import { Router } from 'express';
import { z } from 'zod';
import { runOrchestrator } from '../ai/orchestrator.js';
import { pool } from '../db/pool.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireServiceToken } from '../middleware/service-token.js';
import { threatAnalysisRateLimiter } from '../middleware/ai-rate-limit.js';

export const threatsRouter = Router();
const ThreatRequestSchema = z.object({
  target: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(200),
  signal_type: z.string().trim().max(100).optional(),
  details: z.string().max(5000).optional()
});

threatsRouter.get('/threats/summary', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM incidents) AS total_incidents,
        (SELECT COUNT(*)::int FROM incidents WHERE status IN ('open', 'investigating', 'contained')) AS open_workflow,
        (SELECT COUNT(*)::int FROM incidents WHERE severity = 'critical' AND status NOT IN ('resolved', 'closed')) AS critical,
        (SELECT COUNT(*)::int FROM incidents WHERE status IN ('resolved', 'closed')) AS mitigated,
        (SELECT COUNT(*)::int FROM alerts WHERE status = 'active') AS active_alerts,
        (SELECT COUNT(*)::int FROM security_events WHERE review_status = 'new') AS new_security_events,
        (SELECT COUNT(*)::int FROM security_events WHERE severity = 'critical' AND review_status = 'new') AS critical_security_events,
        GREATEST(
          (SELECT MAX(created_at) FROM incidents),
          (SELECT MAX(created_at) FROM alerts),
          (SELECT MAX(received_at) FROM security_events)
        ) AS updated_at
    `);
    const row = result.rows[0] ?? {};
    return res.status(200).json({
      status: 'ok',
      is_demo: false,
      data_source: 'postgresql',
      summary: {
        total_incidents: Number(row.total_incidents ?? 0),
        open_workflow: Number(row.open_workflow ?? 0),
        critical: Number(row.critical ?? 0),
        mitigated: Number(row.mitigated ?? 0),
        active_alerts: Number(row.active_alerts ?? 0),
        new_security_events: Number(row.new_security_events ?? 0),
        critical_security_events: Number(row.critical_security_events ?? 0),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
      }
    });
  } catch {
    return res.status(503).json({
      error: 'THREAT_SUMMARY_UNAVAILABLE',
      message: 'Live threat summary is unavailable because the PostgreSQL data store could not be queried.'
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
