import { Router } from 'express';
import { z } from 'zod';
import { analyzeThreatWithAgent } from '../ai/agents/threat-analysis.js';
import { requireServiceToken } from '../middleware/service-token.js';

export const threatsRouter = Router();

const ThreatRequestSchema = z.object({
  target: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(200),
  signal_type: z.string().trim().max(100).optional(),
  details: z.string().max(5000).optional()
});

threatsRouter.get('/threats/summary', async (_req, res) => {
  res.json({
    status: 'ok',
    is_demo: true,
    data_source: 'sample',
    summary: {
      total_incidents: 17,
      critical: 4,
      mitigated: 12,
      ai_score: 92,
      updated_at: new Date().toISOString()
    }
  });
});

threatsRouter.post('/threats/analyze', requireServiceToken, async (req, res) => {
  const parsed = ThreatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      details: parsed.error.flatten()
    });
  }

  try {
    const analysis = await analyzeThreatWithAgent(parsed.data);

    return res.json({
      status: 'success',
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      target: parsed.data.target,
      source: parsed.data.source,
      ...analysis,
      disclaimer:
        'AI-generated assessment based only on supplied information. It is not proof of a confirmed security incident.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'AI_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
    }

    if (message === 'AI_RATE_LIMIT') {
      return res.status(503).json({ error: 'AI_RATE_LIMIT' });
    }

    if (message === 'AI_REFUSED') {
      return res.status(422).json({ error: 'AI_REFUSED' });
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'AI_TIMEOUT' });
    }

    return res.status(502).json({
      error:
        message === 'AI_AUTH_FAILED'
          ? 'AI_AUTH_FAILED'
          : 'AI_ANALYSIS_FAILED'
    });
  }
});
