import { Router } from 'express';
import { z } from 'zod';

import { requireServiceToken } from '../middleware/service-token.js';
import { analyzeAttackPaths } from '../attack-paths/engine.js';
import type { AnalysisInput } from '../attack-paths/contracts.js';

export const attackPathsRouter = Router();

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

const EvidenceReferenceSchema = z.object({
  id: boundedText(128),
  source: boundedText(200),
  status: z.enum(['verified', 'unverified', 'stale', 'missing']),
  recordedAt: z.string().trim().min(1).max(64).refine(
    (value) => Number.isFinite(Date.parse(value)),
    'recordedAt must be a valid date/time string'
  ),
  note: z.string().trim().max(500).optional()
}).strict();

const AssetSchema = z.object({
  id: boundedText(128),
  type: boundedText(64),
  name: boundedText(200),
  description: z.string().trim().max(500).optional(),
  evidence: z.array(EvidenceReferenceSchema).max(20),
  tags: z.array(boundedText(64)).max(20).optional()
}).strict();

const RelationshipSchema = z.object({
  id: boundedText(128),
  fromAssetId: boundedText(128),
  toAssetId: boundedText(128),
  relationshipType: boundedText(64),
  evidence: z.array(EvidenceReferenceSchema).max(20),
  notes: z.string().trim().max(500).optional()
}).strict();

const AttackPathAnalysisRequestSchema = z.object({
  assets: z.array(AssetSchema).max(500),
  relationships: z.array(RelationshipSchema).max(2000),
  startAssetId: boundedText(128).optional(),
  targetAssetIds: z.array(boundedText(128)).max(100).optional(),
  maxDepth: z.number().int().min(0).max(8).optional(),
  maxPaths: z.number().int().min(1).max(100).optional()
}).strict().superRefine((input, context) => {
  const assetIds = input.assets.map((asset) => asset.id);
  if (new Set(assetIds).size !== assetIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['assets'],
      message: 'Asset IDs must be unique.'
    });
  }

  const relationshipIds = input.relationships.map((relationship) => relationship.id);
  if (new Set(relationshipIds).size !== relationshipIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['relationships'],
      message: 'Relationship IDs must be unique.'
    });
  }

  if (input.targetAssetIds && new Set(input.targetAssetIds).size !== input.targetAssetIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['targetAssetIds'],
      message: 'Target asset IDs must be unique.'
    });
  }
});

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
