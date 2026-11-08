import { Router, type RequestHandler } from 'express';

import { createRequireWorkspaceIntegration } from '../workspaces/workspace.middleware.js';
import { analyzeAttackPaths } from '../attack-paths/engine.js';
import {
  AssetInventoryImportRequestSchema,
  StoredAttackPathAnalysisOptionsSchema
} from '../attack-paths/validation.js';
import {
  assetInventoryStore,
  type AssetInventoryStore
} from './asset-inventory.service.js';

export function createAssetInventoryRouter(
  store: AssetInventoryStore = assetInventoryStore,
  requireAssetsRead: RequestHandler = createRequireWorkspaceIntegration('assets:read'),
  requireAssetsWrite: RequestHandler = createRequireWorkspaceIntegration('assets:write')
) {
  const router = Router();

  router.get('/assets/inventory', requireAssetsRead, async (req, res) => {
    try {
      const inventory = await store.getInventory(req.workspaceIntegration!.workspaceId);
      return res.status(200).json({
        status: 'ok',
        data_source: 'postgresql',
        assets: inventory.assets,
        relationships: inventory.relationships,
        counts: {
          assets: inventory.assets.length,
          relationships: inventory.relationships.length
        }
      });
    } catch {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'The asset inventory could not be loaded from the configured database.'
      });
    }
  });

  router.post('/assets/inventory/import', requireAssetsWrite, async (req, res) => {
    const parsed = AssetInventoryImportRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        details: parsed.error.flatten()
      });
    }

    try {
      const result = await store.upsertInventory(req.workspaceIntegration!.workspaceId, parsed.data);
      return res.status(200).json({
        status: 'ok',
        operation: 'transactional_upsert',
        data_persisted: true,
        external_scan_performed: false,
        ...result,
        note: 'Only the assets, relationships, and evidence submitted in this request were upserted. Existing records not included in the request were not deleted.'
      });
    } catch {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'The inventory transaction failed and was rolled back. No partial import was committed.'
      });
    }
  });

  router.post('/attack-paths/analyze-inventory', requireAssetsRead, async (req, res) => {
    const parsed = StoredAttackPathAnalysisOptionsSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        details: parsed.error.flatten()
      });
    }

    try {
      const inventory = await store.getInventory(req.workspaceIntegration!.workspaceId);
      const analysis = analyzeAttackPaths({
        ...inventory,
        ...parsed.data
      });

      return res.status(200).json({
        status: 'ok',
        analysis_mode: 'read_only_persisted_inventory',
        data_source: 'postgresql',
        read_only: true,
        data_persisted: false,
        external_scan_performed: false,
        analysis,
        disclaimer:
          'Results are potential paths inferred from the stored asset relationships and evidence references. They are not proof of exploitability, compromise, or a completed security scan.'
      });
    } catch {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'The stored inventory could not be analyzed because the database is unavailable.'
      });
    }
  });

  return router;
}

export const assetInventoryRouter = createAssetInventoryRouter();
