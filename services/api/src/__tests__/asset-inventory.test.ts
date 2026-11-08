import express, { type RequestHandler } from 'express';
import { describe, expect, it } from 'vitest';
import request from 'supertest';

import type { AssetInventorySnapshot, AssetInventoryStore } from '../assets/asset-inventory.service.js';
import { createAssetInventoryRouter } from '../assets/asset-inventory.routes.js';

const integrationToken = 'nexus-inventory-test-token'.padEnd(48, 'x');
const TEST_WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440099';

const sampleInventory: AssetInventorySnapshot = {
  assets: [
    {
      id: 'identity-1',
      type: 'identity',
      name: 'Test identity',
      evidence: [{
        id: 'asset-evidence-1',
        source: 'test-fixture',
        status: 'verified',
        recordedAt: '2026-01-01T00:00:00.000Z'
      }]
    },
    {
      id: 'server-1',
      type: 'server',
      name: 'Test server',
      evidence: [{
        id: 'asset-evidence-2',
        source: 'test-fixture',
        status: 'verified',
        recordedAt: '2026-01-01T00:00:00.000Z'
      }]
    }
  ],
  relationships: [{
    id: 'relationship-1',
    fromAssetId: 'identity-1',
    toAssetId: 'server-1',
    relationshipType: 'has_access_to',
    evidence: [{
      id: 'relationship-evidence-1',
      source: 'test-fixture',
      status: 'verified',
      recordedAt: '2026-01-01T00:00:00.000Z'
    }]
  }]
};

function integrationAccess(permission: 'assets:read' | 'assets:write'): RequestHandler {
  return (req, res, next) => {
    if (req.header('x-nexus-integration-token') !== integrationToken) return res.status(401).json({ error: 'INVALID_INTEGRATION_CREDENTIALS' });
    req.workspaceIntegration = { id: '550e8400-e29b-41d4-a716-446655440098', workspaceId: TEST_WORKSPACE_ID, name: 'Test integration', permissions: [permission] };
    return next();
  };
}
function createTestApp(store: AssetInventoryStore) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createAssetInventoryRouter(store, integrationAccess('assets:read'), integrationAccess('assets:write')));
  return app;
}

function createStore(overrides: Partial<AssetInventoryStore> = {}): AssetInventoryStore {
  return {
    async getInventory() {
      return sampleInventory;
    },
    async upsertInventory(_workspaceId, input) {
      return {
        assetsUpserted: input.assets.length,
        relationshipsUpserted: input.relationships.length,
        evidenceReferencesUpserted:
          input.assets.reduce((count, asset) => count + asset.evidence.length, 0) +
          input.relationships.reduce((count, relationship) => count + relationship.evidence.length, 0)
      };
    },
    ...overrides
  };
}

describe('Persistent asset inventory API', () => {


  it('requires the service token before reading inventory', async () => {
    const response = await request(createTestApp(createStore()))
      .get('/api/assets/inventory');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('INVALID_INTEGRATION_CREDENTIALS');
  });

  it('returns the stored graph as database-sourced inventory', async () => {
    const response = await request(createTestApp(createStore()))
      .get('/api/assets/inventory')
      .set('X-NEXUS-INTEGRATION-TOKEN', integrationToken);

    expect(response.status).toBe(200);
    expect(response.body.data_source).toBe('postgresql');
    expect(response.body.counts.assets).toBe(2);
    expect(response.body.counts.relationships).toBe(1);
  });

  it('validates and upserts an inventory batch', async () => {
    const response = await request(createTestApp(createStore()))
      .post('/api/assets/inventory/import')
      .set('X-NEXUS-INTEGRATION-TOKEN', integrationToken)
      .send(sampleInventory);

    expect(response.status).toBe(200);
    expect(response.body.data_persisted).toBe(true);
    expect(response.body.external_scan_performed).toBe(false);
    expect(response.body.assetsUpserted).toBe(2);
    expect(response.body.relationshipsUpserted).toBe(1);
    expect(response.body.evidenceReferencesUpserted).toBe(3);
  });

  it('rejects duplicate identifiers before calling the store', async () => {
    let storeCalled = false;
    const store = createStore({
      async upsertInventory(_workspaceId, input) {
        storeCalled = true;
        return {
          assetsUpserted: input.assets.length,
          relationshipsUpserted: input.relationships.length,
          evidenceReferencesUpserted: 0
        };
      }
    });
    const duplicateInventory = {
      ...sampleInventory,
      assets: [...sampleInventory.assets, sampleInventory.assets[0]]
    };

    const response = await request(createTestApp(store))
      .post('/api/assets/inventory/import')
      .set('X-NEXUS-INTEGRATION-TOKEN', integrationToken)
      .send(duplicateInventory);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
    expect(storeCalled).toBe(false);
  });

  it('analyzes the persisted graph without changing it', async () => {
    const response = await request(createTestApp(createStore()))
      .post('/api/attack-paths/analyze-inventory')
      .set('X-NEXUS-INTEGRATION-TOKEN', integrationToken)
      .send({ startAssetId: 'identity-1', maxDepth: 3, maxPaths: 10 });

    expect(response.status).toBe(200);
    expect(response.body.data_source).toBe('postgresql');
    expect(response.body.read_only).toBe(true);
    expect(response.body.data_persisted).toBe(false);
    expect(response.body.external_scan_performed).toBe(false);
    expect(response.body.analysis.paths).toHaveLength(1);
    expect(response.body.analysis.paths[0].path).toEqual(['identity-1', 'server-1']);
  });

  it('returns a safe unavailable response when the database store fails', async () => {
    const store = createStore({
      async getInventory() {
        throw new Error('private database error');
      }
    });

    const response = await request(createTestApp(store))
      .get('/api/assets/inventory')
      .set('X-NEXUS-INTEGRATION-TOKEN', integrationToken);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('private database error');
  });
});
