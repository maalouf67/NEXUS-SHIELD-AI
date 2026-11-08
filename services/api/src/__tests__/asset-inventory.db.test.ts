import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresAssetInventoryStore } from '../assets/asset-inventory.service.js';
import { pool } from '../db/pool.js';
import type { AssetInventoryImportRequest } from '../attack-paths/validation.js';

const enabled = process.env.NEXUS_RUN_DB_INTEGRATION === 'true';

describe.skipIf(!enabled)('PostgreSQL asset inventory integration', () => {
  const store = new PostgresAssetInventoryStore();
  const actorId = randomUUID();
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO users (id, email, role, password_hash, is_active)
       VALUES ($1, $2, 'admin', NULL, TRUE)`,
      [actorId, `asset-ci-${actorId}@example.test`]
    );
    await pool.query(
      'INSERT INTO workspaces (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4), ($5, $6, $7, $4)',
      [
        workspaceId, 'Asset CI workspace', `asset-ci-${workspaceId.slice(0, 8)}`,
        actorId, otherWorkspaceId, 'Other Asset CI workspace', `asset-other-${otherWorkspaceId.slice(0, 8)}`
      ]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM relationship_evidence WHERE workspace_id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM asset_relationships WHERE workspace_id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM asset_evidence WHERE workspace_id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM assets WHERE workspace_id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceId, otherWorkspaceId]]);
    await pool.query('DELETE FROM users WHERE id = $1', [actorId]);
    await pool.end();
  });

  it('persists and retrieves assets, relationships, and evidence', async () => {
    const assetId = `asset-${randomUUID()}`;
    const targetId = `target-${randomUUID()}`;
    const relationshipId = `relationship-${randomUUID()}`;

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

    const result = await store.upsertInventory(workspaceId, input);
    expect(result.assetsUpserted).toBe(2);
    expect(result.relationshipsUpserted).toBe(1);
    expect(result.evidenceReferencesUpserted).toBe(2);

    const inventory = await store.getInventory(workspaceId);
    const savedAsset = inventory.assets.find((asset) => asset.id === assetId);
    const savedRelationship = inventory.relationships.find(
      (relationship) => relationship.id === relationshipId
    );

    expect(savedAsset?.name).toBe('CI test identity');
    expect(savedAsset?.evidence[0]?.status).toBe('verified');
    expect(savedRelationship?.toAssetId).toBe(targetId);
    expect(savedRelationship?.evidence[0]?.status).toBe('unverified');
  });

  it('isolates inventory reads and rejects relationships into another workspace', async () => {
    const primaryId = `primary-${randomUUID()}`;
    const otherId = `other-${randomUUID()}`;
    await store.upsertInventory(workspaceId, {
      assets: [{ id: primaryId, type: 'server', name: 'Primary workspace asset', evidence: [] }],
      relationships: []
    });
    await store.upsertInventory(otherWorkspaceId, {
      assets: [{ id: otherId, type: 'server', name: 'Other workspace asset', evidence: [] }],
      relationships: []
    });

    const primaryInventory = await store.getInventory(workspaceId);
    const otherInventory = await store.getInventory(otherWorkspaceId);
    expect(primaryInventory.assets.some((asset) => asset.name === 'Other workspace asset')).toBe(false);
    expect(otherInventory.assets.some((asset) => asset.id === primaryId)).toBe(false);

    const foreignId = `foreign-${randomUUID()}`;
    await expect(store.upsertInventory(otherWorkspaceId, {
      assets: [{ id: foreignId, type: 'identity', name: 'Must roll back', evidence: [] }],
      relationships: [{
        id: `cross-${randomUUID()}`,
        fromAssetId: foreignId,
        toAssetId: primaryId,
        relationshipType: 'references',
        evidence: []
      }]
    })).rejects.toBeDefined();

    const leaked = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND workspace_id = $2',
      [foreignId, otherWorkspaceId]
    );
    expect(leaked.rowCount).toBe(0);
  });

  it('rolls back the complete batch when a relationship violates a foreign key', async () => {
    const assetId = `rollback-asset-${randomUUID()}`;

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

    await expect(store.upsertInventory(workspaceId, invalidInput)).rejects.toBeDefined();

    const lookup = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND workspace_id = $2',
      [assetId, workspaceId]
    );
    expect(lookup.rowCount).toBe(0);
  });
});
