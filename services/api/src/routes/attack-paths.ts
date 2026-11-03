import { Router } from 'express';

import { requireServiceToken } from '../middleware/service-token.js';
import { analyzeAttackPaths } from '../attack-paths/engine.js';
import { AttackPathAnalysisRequestSchema } from '../attack-paths/validation.js';
import type { AnalysisInput } from '../attack-paths/contracts.js';

export const attackPathsRouter = Router();

attackPathsRouter.post('/attack-paths/analyze', requireServiceToken, (req, res) => {
  const parsed = AttackPathAnalysisRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      details: parsed.error.flatten()
    });
  }

  const analysis = analyzeAttackPaths(parsed.data as AnalysisInput);

  return res.status(200).json({
    status: 'ok',
    analysis_mode: 'read_only_graph_analysis',
    read_only: true,
    data_persisted: false,
    external_scan_performed: false,
    analysis,
    disclaimer:
      'Results are potential paths inferred only from the submitted asset relationships and evidence references. They are not proof of exploitability, compromise, or a completed security scan.'
  });
});
