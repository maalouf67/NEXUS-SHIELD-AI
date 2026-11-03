import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import { PostgresAssetInventoryStore } from '../assets/asset-inventory.service.js';
import { pool } from '../db/pool.js';
import type { AssetInventoryImportRequest } from '../attack-paths/validation.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';

describe.skipIf(!enabled)('PostgreSQL asset inventory integration', () => {
  const store = new PostgresAssetInventoryStore();
  const createdAssetIds: string[] = [];

  afterAll(async () => {
    if (createdAssetIds.length > 0) {
      await pool.query(
        'DELETE FROM assets WHERE id = ANY($1::varchar[])',
        [createdAssetIds]
      );
    }
    await pool.end();
  });

  it('persists and retrieves assets, relationships, and evidence', async () => {
    const assetId = `asset-${randomUUID()}`;
    const targetId = `target-${randomUUID()}`;
    const relationshipId = `relationship-${randomUUID()}`;
    createdAssetIds.push(assetId, targetId);

    const input: AssetInventoryImportRequest = {
      assets: [
        {
          id: assetId,
          type: 'identity',
          name: 'CI test identity',
          tags: ['ci', 'identity'],
          evidence: [{
            id: `evidence-${randomUUID()}`,
            source: 'ci-integration-test',
            status: 'verified',
            recordedAt: '2026-01-01T00:00:00.000Z'
          }]
        },
        {
          id: targetId,
          type: 'server',
          name: 'CI test server',
          evidence: []
        }
      ],
      relationships: [{
        id: relationshipId,
        fromAssetId: assetId,
        toAssetId: targetId,
        relationshipType: 'has_access_to',
        evidence: [{
          id: `relationship-evidence-${randomUUID()}`,
          source: 'ci-integration-test',
          status: 'unverified',
          recordedAt: '2026-01-01T00:00:00.000Z'
        }]
      }]
    };

    const result = await store.upsertInventory(input);
    expect(result.assetsUpserted).toBe(2);
    expect(result.relationshipsUpserted).toBe(1);
    expect(result.evidenceReferencesUpserted).toBe(2);

    const inventory = await store.getInventory();
    const savedAsset = inventory.assets.find((asset) => asset.id === assetId);
    const savedRelationship = inventory.relationships.find(
      (relationship) => relationship.id === relationshipId
    );

    expect(savedAsset?.name).toBe('CI test identity');
    expect(savedAsset?.evidence[0]?.status).toBe('verified');
    expect(savedRelationship?.toAssetId).toBe(targetId);
    expect(savedRelationship?.evidence[0]?.status).toBe('unverified');
  });

  it('rolls back the complete batch when a relationship violates a foreign key', async () => {
    const assetId = `rollback-asset-${randomUUID()}`;
    createdAssetIds.push(assetId);

    const invalidInput: AssetInventoryImportRequest = {
      assets: [{
        id: assetId,
        type: 'server',
        name: 'Must roll back',
        evidence: []
      }],
      relationships: [{
        id: `invalid-relationship-${randomUUID()}`,
        fromAssetId: assetId,
        toAssetId: `missing-target-${randomUUID()}`,
        relationshipType: 'references',
        evidence: []
      }]
    };

    await expect(store.upsertInventory(invalidInput)).rejects.toBeDefined();

    const lookup = await pool.query(
      'SELECT id FROM assets WHERE id = $1',
      [assetId]
    );
    expect(lookup.rowCount).toBe(0);
  });
});
