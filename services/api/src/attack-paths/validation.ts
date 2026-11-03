import { z } from 'zod';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const EvidenceReferenceSchema = z.object({
  id: boundedText(128),
  source: boundedText(200),
  status: z.enum(['verified', 'unverified', 'stale', 'missing']),
  recordedAt: z.string().trim().min(1).max(64).refine(
    (value) => Number.isFinite(Date.parse(value)),
    'recordedAt must be a valid date/time string'
  ),
  note: z.string().trim().max(500).optional()
}).strict();

export const AssetSchema = z.object({
  id: boundedText(128),
  type: boundedText(64),
  name: boundedText(200),
  description: z.string().trim().max(500).optional(),
  evidence: z.array(EvidenceReferenceSchema).max(20),
  tags: z.array(boundedText(64)).max(20).optional()
}).strict();

export const RelationshipSchema = z.object({
  id: boundedText(128),
  fromAssetId: boundedText(128),
  toAssetId: boundedText(128),
  relationshipType: boundedText(64),
  evidence: z.array(EvidenceReferenceSchema).max(20),
  notes: z.string().trim().max(500).optional()
}).strict();

const GraphInventorySchema = z.object({
  assets: z.array(AssetSchema).max(500),
  relationships: z.array(RelationshipSchema).max(2000)
}).strict();

function validateUniqueGraphIdentifiers(
  input: z.infer<typeof GraphInventorySchema> & {
    targetAssetIds?: string[];
  },
  context: z.RefinementCtx
) {
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
}

export const AssetInventoryImportRequestSchema = GraphInventorySchema.superRefine(
  validateUniqueGraphIdentifiers
);

export const AttackPathAnalysisRequestSchema = GraphInventorySchema.extend({
  startAssetId: boundedText(128).optional(),
  targetAssetIds: z.array(boundedText(128)).max(100).optional(),
  maxDepth: z.number().int().min(0).max(8).optional(),
  maxPaths: z.number().int().min(1).max(100).optional()
}).strict().superRefine(validateUniqueGraphIdentifiers);

export const StoredAttackPathAnalysisOptionsSchema = z.object({
  startAssetId: boundedText(128).optional(),
  targetAssetIds: z.array(boundedText(128)).max(100).optional(),
  maxDepth: z.number().int().min(0).max(8).optional(),
  maxPaths: z.number().int().min(1).max(100).optional()
}).strict().superRefine((input, context) => {
  if (input.targetAssetIds && new Set(input.targetAssetIds).size !== input.targetAssetIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['targetAssetIds'],
      message: 'Target asset IDs must be unique.'
    });
  }
});

export type AssetInventoryImportRequest = z.infer<typeof AssetInventoryImportRequestSchema>;
