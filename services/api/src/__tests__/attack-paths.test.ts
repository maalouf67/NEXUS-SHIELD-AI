import { describe, expect, it } from 'vitest';
import type { Asset, AssetRelationship, EvidenceReference, EvidenceStatus } from '../attack-paths/contracts.js';
import { analyzeAttackPaths } from '../attack-paths/engine.js';

const evidence = (
  id: string,
  source: string,
  status: EvidenceStatus = 'verified'
): EvidenceReference => ({
  id,
  source,
  status,
  recordedAt: '2024-01-01T00:00:00.000Z',
  note: `evidence for ${id}`
});

const asset = (id: string, type: string, name: string, references: EvidenceReference[] = [evidence(`${id}-ev`, `source:${id}`)]): Asset => ({
  id,
  type,
  name,
  evidence: references
});

const relationship = (
  id: string,
  fromAssetId: string,
  toAssetId: string,
  overrides: Partial<AssetRelationship> = {}
): AssetRelationship => ({
  id,
  fromAssetId,
  toAssetId,
  relationshipType: 'connects_to',
  evidence: [evidence(`${id}-ev`, `source:${id}`)],
  ...overrides
});

describe('Attack path intelligence foundation', () => {
  it('returns a valid directed path', () => {
    const result = analyzeAttackPaths({
      assets: [
        asset('asset-a', 'identity', 'Asset A'),
        asset('asset-b', 'identity', 'Asset B'),
        asset('asset-c', 'identity', 'Asset C')
      ],
      relationships: [
        relationship('r1', 'asset-a', 'asset-b'),
        relationship('r2', 'asset-b', 'asset-c')
      ],
      startAssetId: 'asset-a',
      maxDepth: 4,
      maxPaths: 10
    });

    expect(result.paths.some((path) => path.path.join('>') === 'asset-a>asset-b>asset-c')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'MISSING_EVIDENCE')).toBe(false);
  });

  it('warns when a relationship references a missing asset', () => {
    const result = analyzeAttackPaths({
      assets: [asset('asset-a', 'identity', 'Asset A')],
      relationships: [relationship('r1', 'asset-a', 'asset-missing')],
      startAssetId: 'asset-a',
      maxDepth: 3,
      maxPaths: 10
    });

    expect(result.warnings.some((warning) => warning.code === 'MISSING_ASSET_REFERENCE')).toBe(true);
  });

  it('warns when evidence is missing', () => {
    const result = analyzeAttackPaths({
      assets: [asset('asset-a', 'identity', 'Asset A'), asset('asset-b', 'identity', 'Asset B')],
      relationships: [relationship('r1', 'asset-a', 'asset-b', { evidence: [] })],
      startAssetId: 'asset-a',
      maxDepth: 3,
      maxPaths: 10
    });

    expect(result.warnings.some((warning) => warning.code === 'MISSING_EVIDENCE')).toBe(true);
  });

  it('warns on unverified relationships', () => {
    const result = analyzeAttackPaths({
      assets: [asset('asset-a', 'identity', 'Asset A'), asset('asset-b', 'identity', 'Asset B')],
      relationships: [
        relationship('r1', 'asset-a', 'asset-b', {
          evidence: [evidence('ev1', 'source:manual', 'unverified')]
        })
      ],
      startAssetId: 'asset-a',
      maxDepth: 3,
      maxPaths: 10
    });

    expect(result.warnings.some((warning) => warning.code === 'UNVERIFIED_EVIDENCE')).toBe(true);
  });

  it('stops traversal when a cycle is encountered', () => {
    const result = analyzeAttackPaths({
      assets: [
        asset('asset-a', 'identity', 'Asset A'),
        asset('asset-b', 'identity', 'Asset B'),
        asset('asset-c', 'identity', 'Asset C')
      ],
      relationships: [
        relationship('r1', 'asset-a', 'asset-b'),
        relationship('r2', 'asset-b', 'asset-c'),
        relationship('r3', 'asset-c', 'asset-a')
      ],
      startAssetId: 'asset-a',
      maxDepth: 10,
      maxPaths: 10
    });

    expect(result.warnings.some((warning) => warning.code === 'CYCLE_DETECTED')).toBe(true);
    expect(result.paths.some((path) => path.path.includes('asset-a') && path.path.length > 3)).toBe(false);
  });

  it('deduplicates duplicate edges', () => {
    const result = analyzeAttackPaths({
      assets: [asset('asset-a', 'identity', 'Asset A'), asset('asset-b', 'identity', 'Asset B')],
      relationships: [
        relationship('r1', 'asset-a', 'asset-b'),
        relationship('r1-copy', 'asset-a', 'asset-b')
      ],
      startAssetId: 'asset-a',
      maxDepth: 3,
      maxPaths: 10
    });

    expect(result.paths.filter((path) => path.path.join('>') === 'asset-a>asset-b')).toHaveLength(1);
  });

  it('honors the configured maximum depth', () => {
    const result = analyzeAttackPaths({
      assets: [
        asset('asset-a', 'identity', 'Asset A'),
        asset('asset-b', 'identity', 'Asset B'),
        asset('asset-c', 'identity', 'Asset C'),
        asset('asset-d', 'identity', 'Asset D')
      ],
      relationships: [
        relationship('r1', 'asset-a', 'asset-b'),
        relationship('r2', 'asset-b', 'asset-c'),
        relationship('r3', 'asset-c', 'asset-d')
      ],
      startAssetId: 'asset-a',
      maxDepth: 1,
      maxPaths: 10
    });

    expect(result.paths.every((path) => path.path.length <= 3)).toBe(true);
  });

  it('honors the maximum returned paths', () => {
    const result = analyzeAttackPaths({
      assets: [
        asset('asset-a', 'identity', 'Asset A'),
        asset('asset-b', 'identity', 'Asset B'),
        asset('asset-c', 'identity', 'Asset C'),
        asset('asset-d', 'identity', 'Asset D')
      ],
      relationships: [
        relationship('r1', 'asset-a', 'asset-b'),
        relationship('r2', 'asset-a', 'asset-c'),
        relationship('r3', 'asset-a', 'asset-d')
      ],
      startAssetId: 'asset-a',
      maxDepth: 3,
      maxPaths: 2
    });

    expect(result.paths.length).toBeLessThanOrEqual(2);
  });

  it('produces deterministic output for equivalent inputs', () => {
    const first = analyzeAttackPaths({
      assets: [asset('asset-c', 'identity', 'Asset C'), asset('asset-b', 'identity', 'Asset B'), asset('asset-a', 'identity', 'Asset A')],
      relationships: [
        relationship('r4', 'asset-a', 'asset-c'),
        relationship('r2', 'asset-a', 'asset-b'),
        relationship('r3', 'asset-b', 'asset-c')
      ],
      startAssetId: 'asset-a',
      maxDepth: 4,
      maxPaths: 10
    });

    const second = analyzeAttackPaths({
      assets: [asset('asset-a', 'identity', 'Asset A'), asset('asset-b', 'identity', 'Asset B'), asset('asset-c', 'identity', 'Asset C')],
      relationships: [
        relationship('r2', 'asset-a', 'asset-b'),
        relationship('r3', 'asset-b', 'asset-c'),
        relationship('r4', 'asset-a', 'asset-c')
      ],
      startAssetId: 'asset-a',
      maxDepth: 4,
      maxPaths: 10
    });

    expect(first.paths.map((path) => path.path.join('>'))).toEqual(second.paths.map((path) => path.path.join('>')));
  });

  it('returns an empty result for an empty graph', () => {
    const result = analyzeAttackPaths({
      assets: [],
      relationships: [],
      maxDepth: 4,
      maxPaths: 10
    });

    expect(result.paths).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === 'EMPTY_GRAPH')).toBe(true);
  });
});
