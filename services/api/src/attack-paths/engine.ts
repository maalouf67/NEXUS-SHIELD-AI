import type {
  AnalysisInput,
  AnalysisOutput,
  Asset,
  AssetPath,
  AssetRelationship,
  EvidenceReference,
  ValidationWarning
} from './contracts.js';

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_PATHS = 25;

function sortAssets(a: Asset, b: Asset): number {
  return a.id.localeCompare(b.id);
}

function sortRelationships(a: AssetRelationship, b: AssetRelationship): number {
  return a.id.localeCompare(b.id);
}

function deduplicateRelationships(relationships: AssetRelationship[]): AssetRelationship[] {
  const unique = new Map<string, AssetRelationship>();

  for (const relationship of [...relationships].sort(sortRelationships)) {
    const key = `${relationship.fromAssetId}->${relationship.toAssetId}:${relationship.relationshipType}`;
    if (unique.has(key)) {
      continue;
    }

    unique.set(key, relationship);
  }

  return [...unique.values()];
}

function asWarningsUnique(warnings: ValidationWarning[]): ValidationWarning[] {
  const seen = new Set<string>();
  const uniqueWarnings: ValidationWarning[] = [];

  for (const warning of warnings) {
    const key = [warning.code, warning.assetId ?? '', warning.relationshipId ?? '', warning.evidenceId ?? '', warning.message].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueWarnings.push(warning);
    }
  }

  return uniqueWarnings.sort((a, b) => a.code.localeCompare(b.code));
}

function relationshipEvidence(relationship: AssetRelationship): EvidenceReference[] {
  return [...relationship.evidence].sort((a, b) => a.id.localeCompare(b.id));
}

function pushPath(paths: AssetPath[], seen: Set<string>, path: string[], relationshipIds: string[], evidence: EvidenceReference[]): void {
  const pathKey = `${path.join('>')}|${relationshipIds.join('>')}`;
  if (seen.has(pathKey)) {
    return;
  }

  seen.add(pathKey);
  paths.push({
    path,
    relationshipIds,
    evidence: [...evidence].sort((a, b) => a.id.localeCompare(b.id))
  });
}

export function analyzeAttackPaths(input: AnalysisInput): AnalysisOutput {
  const warnings: ValidationWarning[] = [];
  const assets = [...input.assets].sort(sortAssets);
  const relationships = deduplicateRelationships(input.relationships);
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const startAssetId = input.startAssetId && assetMap.has(input.startAssetId)
    ? input.startAssetId
    : assets[0]?.id ?? null;

  const maxDepth = Number.isFinite(input.maxDepth) ? Math.max(0, Number(input.maxDepth)) : DEFAULT_MAX_DEPTH;
  const maxPaths = Number.isFinite(input.maxPaths) ? Math.max(1, Number(input.maxPaths)) : DEFAULT_MAX_PATHS;

  if (assets.length === 0 && relationships.length === 0) {
    warnings.push({
      code: 'EMPTY_GRAPH',
      severity: 'info',
      message: 'No assets or relationships were provided, so no attack path analysis was performed.'
    });

    return {
      paths: [],
      warnings: asWarningsUnique(warnings),
      summary: {
        assetsAnalyzed: 0,
        relationshipsAnalyzed: 0,
        maxDepth,
        maxPaths,
        startAssetId
      }
    };
  }

  if (input.startAssetId && !assetMap.has(input.startAssetId)) {
    warnings.push({
      code: 'START_ASSET_NOT_FOUND',
      severity: 'warning',
      message: `The configured start asset '${input.startAssetId}' was not found in the graph.`,
      assetId: input.startAssetId
    });
  }

  for (const asset of assets) {
    if (asset.evidence.length === 0) {
      warnings.push({
        code: 'MISSING_ASSET_EVIDENCE',
        severity: 'warning',
        message: `Asset '${asset.id}' has no evidence references.`,
        assetId: asset.id
      });
    }
  }

  for (const relationship of relationships) {
    const validFrom = assetMap.has(relationship.fromAssetId);
    const validTo = assetMap.has(relationship.toAssetId);

    if (!validFrom || !validTo) {
      warnings.push({
        code: 'MISSING_ASSET_REFERENCE',
        severity: 'warning',
        message: `Relationship '${relationship.id}' references an unknown asset.`,
        relationshipId: relationship.id
      });
      continue;
    }

    if (relationship.evidence.length === 0) {
      warnings.push({
        code: 'MISSING_EVIDENCE',
        severity: 'warning',
        message: `Relationship '${relationship.id}' has no evidence references.`,
        relationshipId: relationship.id
      });
    }

    const statusWarnings = relationship.evidence.map((reference) => {
      if (reference.status === 'unverified') {
        return {
          code: 'UNVERIFIED_EVIDENCE',
          severity: 'warning' as const,
          message: `Evidence '${reference.id}' for relationship '${relationship.id}' is unverified.`,
          relationshipId: relationship.id,
          evidenceId: reference.id
        };
      }

      if (reference.status === 'stale') {
        return {
          code: 'STALE_EVIDENCE',
          severity: 'warning' as const,
          message: `Evidence '${reference.id}' for relationship '${relationship.id}' is stale.`,
          relationshipId: relationship.id,
          evidenceId: reference.id
        };
      }

      if (reference.status === 'missing') {
        return {
          code: 'MISSING_EVIDENCE',
          severity: 'warning' as const,
          message: `Evidence '${reference.id}' for relationship '${relationship.id}' is missing.`,
          relationshipId: relationship.id,
          evidenceId: reference.id
        };
      }

      return null;
    });

    for (const warning of statusWarnings) {
      if (warning) {
        warnings.push(warning);
      }
    }
  }

  const adjacency = new Map<string, AssetRelationship[]>();
  for (const relationship of relationships) {
    if (!assetMap.has(relationship.fromAssetId) || !assetMap.has(relationship.toAssetId)) {
      continue;
    }

    const list = adjacency.get(relationship.fromAssetId) ?? [];
    list.push(relationship);
    adjacency.set(relationship.fromAssetId, list);
  }

  const pathResults: AssetPath[] = [];
  const pathSeen = new Set<string>();

  function visit(currentId: string, currentPath: string[], relationshipIds: string[], visited: Set<string>, depth: number, accumulatedEvidence: EvidenceReference[]): void {
    if (pathResults.length >= maxPaths) {
      return;
    }

    const outgoing = [...(adjacency.get(currentId) ?? [])].sort((a, b) => a.id.localeCompare(b.id));

    for (const relationship of outgoing) {
      const nextId = relationship.toAssetId;

      if (visited.has(nextId)) {
        warnings.push({
          code: 'CYCLE_DETECTED',
          severity: 'warning',
          message: `Cycle detected while traversing from '${currentId}' to '${nextId}'.`,
          relationshipId: relationship.id,
          assetId: nextId
        });
        continue;
      }

      const nextPath = [...currentPath, nextId];
      const nextRelationshipIds = [...relationshipIds, relationship.id];
      const nextEvidence = [...accumulatedEvidence, ...relationshipEvidence(relationship)];

      if (nextPath.length > 1 && nextPath.length - 1 <= maxDepth) {
        pushPath(pathResults, pathSeen, nextPath, nextRelationshipIds, nextEvidence);
      }

      if (depth < maxDepth && pathResults.length < maxPaths) {
        visit(nextId, nextPath, nextRelationshipIds, new Set(visited).add(nextId), depth + 1, nextEvidence);
      }
    }
  }

  if (startAssetId) {
    visit(startAssetId, [startAssetId], [], new Set([startAssetId]), 0, []);
  }

  const finalWarnings = asWarningsUnique(warnings);
  const orderedPaths = [...pathResults].sort((left, right) => {
    const leftKey = left.path.join('>');
    const rightKey = right.path.join('>');
    return leftKey.localeCompare(rightKey);
  });

  return {
    paths: orderedPaths,
    warnings: finalWarnings,
    summary: {
      assetsAnalyzed: assets.length,
      relationshipsAnalyzed: relationships.length,
      maxDepth,
      maxPaths,
      startAssetId
    }
  };
}
