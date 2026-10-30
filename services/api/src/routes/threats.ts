import { Router } from 'express';

export const threatsRouter = Router();

threatsRouter.get('/threats/summary', async (_req, res) => {
  res.json({
    status: 'ok',
    summary: {
      total_incidents: 17,
      critical: 4,
      mitigated: 12,
      ai_score: 92,
      updated_at: new Date().toISOString()
    }
  });
});

threatsRouter.post('/threats/analyze', async (req, res) => {
  const { target, source } = req.body ?? {};

  if (!target || !source) {
    return res.status(400).json({ error: 'target and source are required' });
  }

  res.json({
    target,
    source,
    classification: 'elevated',
    risk_score: 77,
    recommendations: [
      'Isolate affected endpoints',
      'Review access tokens',
      'Escalate for human analyst review'
    ]
  });
});
