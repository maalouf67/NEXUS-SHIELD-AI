import { pool } from '../db/pool.js';
import type { Asset, AssetRelationship, EvidenceReference } from '../attack-paths/contracts.js';
import type { AssetInventoryImportRequest } from '../attack-paths/validation.js';

export interface AssetInventorySnapshot {
  assets: Asset[];
  relationships: AssetRelationship[];
}

export interface AssetInventoryUpsertResult {
  assetsUpserted: number;
  relationshipsUpserted: number;
  evidenceReferencesUpserted: number;
}

export interface AssetInventoryStore {
  getInventory(workspaceId: string): Promise<AssetInventorySnapshot>;
  upsertInventory(workspaceId: string, input: AssetInventoryImportRequest): Promise<AssetInventoryUpsertResult>;
}

type EvidenceRow = {
  evidence_id: string;
  source: string;
  status: EvidenceReference['status'];
  recorded_at: Date | string;
  note: string | null;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapEvidence(row: EvidenceRow): EvidenceReference {
  return {
    id: row.evidence_id,
    source: row.source,
    status: row.status,
    recordedAt: toIsoString(row.recorded_at),
    note: row.note ?? undefined
  };
}

export class PostgresAssetInventoryStore implements AssetInventoryStore {
  async getInventory(workspaceId: string): Promise<AssetInventorySnapshot> {
    const [assetRows, assetEvidenceRows, relationshipRows, relationshipEvidenceRows] =
      await Promise.all([
        pool.query(
          'SELECT id, asset_type, name, description, tags FROM assets WHERE workspace_id = $1 ORDER BY id',
          [workspaceId]
        ),
        pool.query(
          'SELECT asset_id, evidence_id, source, status, recorded_at, note FROM asset_evidence WHERE workspace_id = $1 ORDER BY asset_id, evidence_id, source',
          [workspaceId]
        ),
        pool.query(
          'SELECT id, from_asset_id, to_asset_id, relationship_type, notes FROM asset_relationships WHERE workspace_id = $1 ORDER BY id',
          [workspaceId]
        ),
        pool.query(
          'SELECT relationship_id, evidence_id, source, status, recorded_at, note FROM relationship_evidence WHERE workspace_id = $1 ORDER BY relationship_id, evidence_id, source',
          [workspaceId]
        )
      ]);

    const assetEvidence = new Map<string, EvidenceReference[]>();
    for (const row of assetEvidenceRows.rows as Array<{ asset_id: string } & EvidenceRow>) {
      const current = assetEvidence.get(row.asset_id) ?? [];
      current.push(mapEvidence(row));
      assetEvidence.set(row.asset_id, current);
    }

    const relationshipEvidence = new Map<string, EvidenceReference[]>();
    for (const row of relationshipEvidenceRows.rows as Array<{ relationship_id: string } & EvidenceRow>) {
      const current = relationshipEvidence.get(row.relationship_id) ?? [];
      current.push(mapEvidence(row));
      relationshipEvidence.set(row.relationship_id, current);
    }

    const assets: Asset[] = assetRows.rows.map((row) => ({
      id: row.id,
      type: row.asset_type,
      name: row.name,
      description: row.description ?? undefined,
      tags: row.tags ?? [],
      evidence: assetEvidence.get(row.id) ?? []
    }));

    const relationships: AssetRelationship[] = relationshipRows.rows.map((row) => ({
      id: row.id,
      fromAssetId: row.from_asset_id,
      toAssetId: row.to_asset_id,
      relationshipType: row.relationship_type,
      notes: row.notes ?? undefined,
      evidence: relationshipEvidence.get(row.id) ?? []
    }));

    return { assets, relationships };
  }

  async upsertInventory(workspaceId: string, input: AssetInventoryImportRequest): Promise<AssetInventoryUpsertResult> {
    const client = await pool.connect();
    const evidenceReferencesUpserted =
      input.assets.reduce((count, asset) => count + asset.evidence.length, 0) +
      input.relationships.reduce((count, relationship) => count + relationship.evidence.length, 0);

    try {
      await client.query('BEGIN');

      for (const asset of input.assets) {
        await client.query(
          `INSERT INTO assets (workspace_id, id, asset_type, name, description, tags)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (workspace_id, id) DO UPDATE SET
             asset_type = EXCLUDED.asset_type,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             tags = EXCLUDED.tags,
             updated_at = NOW()`,
          [workspaceId, asset.id, asset.type, asset.name, asset.description ?? null, asset.tags ?? []]
        );

        for (const evidence of asset.evidence) {
          await client.query(
            `INSERT INTO asset_evidence
              (workspace_id, asset_id, evidence_id, source, status, recorded_at, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (asset_id, evidence_id, source) DO UPDATE SET
               status = EXCLUDED.status,
               recorded_at = EXCLUDED.recorded_at,
               note = EXCLUDED.note`,
            [workspaceId, asset.id, evidence.id, evidence.source, evidence.status, evidence.recordedAt, evidence.note ?? null]
          );
        }
      }

      for (const relationship of input.relationships) {
        await client.query(
          `INSERT INTO asset_relationships
            (workspace_id, id, from_asset_id, to_asset_id, relationship_type, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (workspace_id, id) DO UPDATE SET
             from_asset_id = EXCLUDED.from_asset_id,
             to_asset_id = EXCLUDED.to_asset_id,
             relationship_type = EXCLUDED.relationship_type,
             notes = EXCLUDED.notes,
             updated_at = NOW()`,
          [
            workspaceId,
            relationship.id,
            relationship.fromAssetId,
            relationship.toAssetId,
            relationship.relationshipType,
            relationship.notes ?? null
          ]
        );

        for (const evidence of relationship.evidence) {
          await client.query(
            `INSERT INTO relationship_evidence
              (workspace_id, relationship_id, evidence_id, source, status, recorded_at, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (relationship_id, evidence_id, source) DO UPDATE SET
               status = EXCLUDED.status,
               recorded_at = EXCLUDED.recorded_at,
               note = EXCLUDED.note`,
            [
              workspaceId,
              relationship.id,
              evidence.id,
              evidence.source,
              evidence.status,
              evidence.recordedAt,
              evidence.note ?? null
            ]
          );
        }
      }

      await client.query('COMMIT');

      return {
        assetsUpserted: input.assets.length,
        relationshipsUpserted: input.relationships.length,
        evidenceReferencesUpserted
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

export const assetInventoryStore = new PostgresAssetInventoryStore();
