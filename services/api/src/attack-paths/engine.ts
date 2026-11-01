import type {
  AnalysisInput,
  AnalysisOutput,
  Asset,
  AssetPath,
  AssetRelationship,
  EvidenceReference,
  EvidenceStatus,
  ValidationWarning
} from './contracts.js';

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_PATHS = 25;
const MAX_DEPTH_LIMIT = 8;
const MAX_PATHS_LIMIT = 100;
const VALID_EVIDENCE_STATUSES = new Set<EvidenceStatus>(['verified', 'unverified', 'stale', 'missing']);

function sortAssets(a: Asset, b: Asset): number {
  return a.id.localeCompare(b.id);
}

function sortRelationships(a: AssetRelationship, b: AssetRelationship): number {
  return a.id.localeCompare(b.id);
}

function sortEvidence(a: EvidenceReference, b: EvidenceReference): number {
  return a.id.localeCompare(b.id) || a.source.localeCompare(b.source);
}

function deduplicateEvidence(references: EvidenceReference[]): EvidenceReference[] {
  const unique = new Map<string, EvidenceReference>();

  for (const reference of [...references].sort(sortEvidence)) {
    const key = `${reference.id}|${reference.source}|${reference.status}|${reference.recordedAt}`;
    if (!unique.has(key)) {
      unique.set(key, reference);
    }
  }

  return [...unique.values()];
}

function filterNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => Boolean(value) && value.trim().length > 0).map((value) => value.trim()))].sort((a, b) => a.localeCompare(b));
}

function normalizeEvidenceReference(
  reference: Partial<EvidenceReference> | null | undefined,
  context: string,
  warnings: ValidationWarning[],
  assetId?: string,
  relationshipId?: string
): EvidenceReference | null {
  if (!reference || typeof reference !== 'object') {
    warnings.push({
      code: 'INVALID_EVIDENCE',
      severity: 'warning',
      message: `${context} evidence is missing or malformed.`,
      assetId,
      relationshipId
    });
    return null;
  }

  const evidenceId = typeof reference.id === 'string' ? reference.id.trim() : '';
  const source = typeof reference.source === 'string' ? reference.source.trim() : '';
  const recordedAt = typeof reference.recordedAt === 'string' ? reference.recordedAt.trim() : '';
  const status = reference.status;

  if (!evidenceId) {
    warnings.push({
      code: 'INVALID_EVIDENCE',
      severity: 'warning',
      message: `${context} evidence is missing its identifier.`,
      assetId,
      relationshipId
    });
    return null;
  }

  if (!source) {
    warnings.push({
      code: 'INVALID_EVIDENCE',
      severity: 'warning',
      message: `${context} evidence '${evidenceId}' is missing a source.`,
      assetId,
      relationshipId,
      evidenceId
    });
    return null;
  }

  if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
    warnings.push({
      code: 'INVALID_EVIDENCE',
      severity: 'warning',
      message: `${context} evidence '${evidenceId}' has an invalid recordedAt timestamp.`,
      assetId,
      relationshipId,
      evidenceId
    });
    return null;
  }

  if (!VALID_EVIDENCE_STATUSES.has(status as EvidenceStatus)) {
    warnings.push({
      code: 'INVALID_EVIDENCE',
      severity: 'warning',
      message: `${context} evidence '${evidenceId}' has an invalid status '${String(status)}'.`,
      assetId,
      relationshipId,
      evidenceId
    });
    return null;
  }

  return {
    id: evidenceId,
    source,
    status: status as EvidenceStatus,
    recordedAt,
    note: typeof reference.note === 'string' && reference.note.trim().length > 0 ? reference.note.trim() : undefined
  };
}

function normalizeEvidenceList(
  evidenceList: Array<Partial<EvidenceReference> | null | undefined>,
  context: string,
  warnings: ValidationWarning[],
  assetId?: string,
  relationshipId?: string
): EvidenceReference[] {
  return evidenceList
    .map((reference) => normalizeEvidenceReference(reference, context, warnings, assetId, relationshipId))
    .filter((reference): reference is EvidenceReference => reference !== null);
}

function deduplicateRelationships(relationships: AssetRelationship[]): AssetRelationship[] {
  const unique = new Map<string, AssetRelationship>();

  for (const relationship of [...relationships].sort(sortRelationships)) {
    const key = `${relationship.fromAssetId}->${relationship.toAssetId}:${relationship.relationshipType}`;
    const existing = unique.get(key);

    if (!existing) {
      unique.set(key, {
        ...relationship,
        evidence: deduplicateEvidence(relationship.evidence),
        duplicateRelationshipIds: [relationship.id]
      });
      continue;
    }

    const mergedIds = filterNonEmptyStrings([
      ...(existing.duplicateRelationshipIds ?? [existing.id]),
      ...(relationship.duplicateRelationshipIds ?? [relationship.id])
    ]);

    unique.set(key, {
      ...existing,
      id: mergedIds[0] ?? existing.id,
      duplicateRelationshipIds: mergedIds,
      evidence: deduplicateEvidence([...existing.evidence, ...relationship.evidence]),
      notes: [existing.notes, relationship.notes].filter((note): note is string => Boolean(note && note.trim())).join(' | ') || undefined
    });
  }

  return [...unique.values()].sort((a, b) => {
    const left = `${a.fromAssetId}>${a.toAssetId}>${a.relationshipType}>${a.id}`;
    const right = `${b.fromAssetId}>${b.toAssetId}>${b.relationshipType}>${b.id}`;
    return left.localeCompare(right);
  });
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

  return uniqueWarnings.sort((a, b) => `${a.code}:${a.message}`.localeCompare(`${b.code}:${b.message}`));
}

function relationshipEvidence(relationship: AssetRelationship): EvidenceReference[] {
  return deduplicateEvidence(relationship.evidence).sort(sortEvidence);
}

function makeWarning(code: string, message: string, severity: 'info' | 'warning' | 'error', assetId?: string, relationshipId?: string, evidenceId?: string): ValidationWarning {
  return { code, message, severity, assetId, relationshipId, evidenceId };
}

function normalizeMaxDepth(value: number | undefined, warnings: ValidationWarning[]): number {
  if (value === undefined || value === null) {
    return DEFAULT_MAX_DEPTH;
  }

  if (!Number.isFinite(value)) {
    warnings.push(makeWarning('INVALID_MAX_DEPTH', 'maxDepth must be a finite number.', 'warning'));
    return DEFAULT_MAX_DEPTH;
  }

  const candidate = Math.trunc(value);
  if (candidate < 0) {
    warnings.push(makeWarning('INVALID_MAX_DEPTH', 'maxDepth must be greater than or equal to 0.', 'warning'));
    return 0;
  }

  if (!Number.isInteger(value)) {
    warnings.push(makeWarning('INVALID_MAX_DEPTH', 'Fractional maxDepth values are not supported; the value was truncated.', 'warning'));
  }

  if (candidate > MAX_DEPTH_LIMIT) {
    warnings.push(makeWarning('INVALID_MAX_DEPTH', `maxDepth exceeded the conservative limit of ${MAX_DEPTH_LIMIT}. It was clamped.`, 'warning'));
    return MAX_DEPTH_LIMIT;
  }

  return candidate;
}

function normalizeMaxPaths(value: number | undefined, warnings: ValidationWarning[]): number {
  if (value === undefined || value === null) {
    return DEFAULT_MAX_PATHS;
  }

  if (!Number.isFinite(value)) {
    warnings.push(makeWarning('INVALID_MAX_PATHS', 'maxPaths must be a finite number.', 'warning'));
    return DEFAULT_MAX_PATHS;
  }

  const candidate = Math.trunc(value);
  if (candidate < 1) {
    warnings.push(makeWarning('INVALID_MAX_PATHS', 'maxPaths must be at least 1.', 'warning'));
    return 1;
  }

  if (!Number.isInteger(value)) {
    warnings.push(makeWarning('INVALID_MAX_PATHS', 'Fractional maxPaths values are not supported; the value was truncated.', 'warning'));
  }

  if (candidate > MAX_PATHS_LIMIT) {
    warnings.push(makeWarning('INVALID_MAX_PATHS', `maxPaths exceeded the conservative limit of ${MAX_PATHS_LIMIT}. It was clamped.`, 'warning'));
    return MAX_PATHS_LIMIT;
  }

  return candidate;
}

function pushPath(paths: AssetPath[], seen: Set<string>, path: string[], relationshipIds: string[], evidence: EvidenceReference[]): void {
  const pathKey = `${path.join('>')}|${relationshipIds.join('>')}`;
  if (seen.has(pathKey)) {
    return;
  }

  seen.add(pathKey);
  paths.push({
    path,
    relationshipIds: filterNonEmptyStrings(relationshipIds),
    evidence: deduplicateEvidence(evidence).sort(sortEvidence)
  });
}

export function analyzeAttackPaths(input: AnalysisInput): AnalysisOutput {
  const warnings: ValidationWarning[] = [];

  const normalizedAssets = [...input.assets].sort(sortAssets).map((asset) => ({
    ...asset,
    evidence: normalizeEvidenceList(asset.evidence, `Asset '${asset.id}'`, warnings, asset.id)
  }));

  const assetMap = new Map(normalizedAssets.map((asset) => [asset.id, asset]));
  const validRelationships = [...input.relationships].map((relationship) => ({
    ...relationship,
    evidence: normalizeEvidenceList(relationship.evidence, `Relationship '${relationship.id}'`, warnings, undefined, relationship.id)
  }));
  const relationships = deduplicateRelationships(validRelationships);

  const maxDepth = normalizeMaxDepth(input.maxDepth, warnings);
  const maxPaths = normalizeMaxPaths(input.maxPaths, warnings);
  const targetIds = Array.isArray(input.targetAssetIds) ? input.targetAssetIds : [];

  if (normalizedAssets.length === 0 && relationships.length === 0) {
    warnings.push(makeWarning('EMPTY_GRAPH', 'No assets or relationships were provided, so no attack path analysis was performed.', 'info'));
    return {
      paths: [],
      warnings: asWarningsUnique(warnings),
      summary: {
        assetsAnalyzed: 0,
        relationshipsAnalyzed: 0,
        maxDepth,
        maxPaths,
        startAssetId: input.startAssetId ?? null
      }
    };
  }

  if (Array.isArray(input.targetAssetIds) && input.targetAssetIds.length === 0) {
    warnings.push(makeWarning('EMPTY_TARGET_SET', 'targetAssetIds was provided as an empty list; no paths were returned.', 'warning'));
    return {
      paths: [],
      warnings: asWarningsUnique(warnings),
      summary: {
        assetsAnalyzed: normalizedAssets.length,
        relationshipsAnalyzed: relationships.length,
        maxDepth,
        maxPaths,
        startAssetId: input.startAssetId ?? normalizedAssets[0]?.id ?? null
      }
    };
  }

  if (input.startAssetId !== undefined && input.startAssetId !== null) {
    const requestedStart = String(input.startAssetId).trim();
    if (!requestedStart) {
      warnings.push(makeWarning('INVALID_START_ASSET', 'The requested start asset identifier is empty.', 'warning'));
      return {
        paths: [],
        warnings: asWarningsUnique(warnings),
        summary: {
          assetsAnalyzed: normalizedAssets.length,
          relationshipsAnalyzed: relationships.length,
          maxDepth,
          maxPaths,
          startAssetId: requestedStart || null
        }
      };
    }

    if (!assetMap.has(requestedStart)) {
      warnings.push(makeWarning('START_ASSET_NOT_FOUND', `The configured start asset '${requestedStart}' was not found in the graph.`, 'warning', requestedStart));
      return {
        paths: [],
        warnings: asWarningsUnique(warnings),
        summary: {
          assetsAnalyzed: normalizedAssets.length,
          relationshipsAnalyzed: relationships.length,
          maxDepth,
          maxPaths,
          startAssetId: requestedStart
        }
      };
    }
  }

  const requestedStart = input.startAssetId !== undefined && input.startAssetId !== null ? String(input.startAssetId).trim() : normalizedAssets[0]?.id ?? null;
  const startAssetId = requestedStart && assetMap.has(requestedStart) ? requestedStart : null;

  if (!startAssetId) {
    return {
      paths: [],
      warnings: asWarningsUnique(warnings),
      summary: {
        assetsAnalyzed: normalizedAssets.length,
        relationshipsAnalyzed: relationships.length,
        maxDepth,
        maxPaths,
        startAssetId: requestedStart
      }
    };
  }

  for (const asset of normalizedAssets) {
    if (asset.evidence.length === 0) {
      warnings.push(makeWarning('MISSING_ASSET_EVIDENCE', `Asset '${asset.id}' has no evidence references.`, 'warning', asset.id));
    }
  }

  for (const relationship of relationships) {
    if (!assetMap.has(relationship.fromAssetId) || !assetMap.has(relationship.toAssetId)) {
      warnings.push(makeWarning('MISSING_ASSET_REFERENCE', `Relationship '${relationship.id}' references an unknown asset.`, 'warning', undefined, relationship.id));
      continue;
    }

    if (relationship.evidence.length === 0) {
      warnings.push(makeWarning('MISSING_EVIDENCE', `Relationship '${relationship.id}' has no evidence references.`, 'warning', undefined, relationship.id));
    }

    for (const reference of relationship.evidence) {
      if (reference.status === 'unverified') {
        warnings.push(makeWarning('UNVERIFIED_EVIDENCE', `Evidence '${reference.id}' for relationship '${relationship.id}' is unverified.`, 'warning', undefined, relationship.id, reference.id));
      }
      if (reference.status === 'stale') {
        warnings.push(makeWarning('STALE_EVIDENCE', `Evidence '${reference.id}' for relationship '${relationship.id}' is stale.`, 'warning', undefined, relationship.id, reference.id));
      }
      if (reference.status === 'missing') {
        warnings.push(makeWarning('MISSING_EVIDENCE', `Evidence '${reference.id}' for relationship '${relationship.id}' is missing.`, 'warning', undefined, relationship.id, reference.id));
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
  const targetSet = new Set(
    targetIds
      .map((candidate) => String(candidate).trim())
      .filter((candidate) => candidate.length > 0)
  );

  for (const targetId of [...targetSet].sort()) {
    if (!assetMap.has(targetId)) {
      warnings.push(makeWarning('TARGET_NOT_FOUND', `Target asset '${targetId}' was not found in the graph.`, 'warning', targetId));
    }
  }

  function visit(currentId: string, currentPath: string[], relationshipIds: string[], visited: Set<string>, depth: number, accumulatedEvidence: EvidenceReference[]): void {
    if (pathResults.length >= maxPaths) {
      return;
    }

    const outgoing = [...(adjacency.get(currentId) ?? [])].sort((a, b) => a.id.localeCompare(b.id));

    for (const relationship of outgoing) {
      const nextId = relationship.toAssetId;

      if (visited.has(nextId)) {
        warnings.push(makeWarning('CYCLE_DETECTED', `Cycle detected while traversing from '${currentId}' to '${nextId}'.`, 'warning', nextId, relationship.id));
        continue;
      }

      const nextPath = [...currentPath, nextId];
      const nextRelationshipIds = [...relationshipIds, ...(relationship.duplicateRelationshipIds ?? [relationship.id])];
      const nextEvidence = deduplicateEvidence([...accumulatedEvidence, ...relationshipEvidence(relationship)]);

      const shouldRecordPath = nextPath.length > 1 && nextPath.length - 1 <= maxDepth && (!targetSet.size || targetSet.has(nextId));
      if (shouldRecordPath) {
        pushPath(pathResults, pathSeen, nextPath, nextRelationshipIds, nextEvidence);
      }

      if (depth < maxDepth && pathResults.length < maxPaths) {
        visit(nextId, nextPath, nextRelationshipIds, new Set(visited).add(nextId), depth + 1, nextEvidence);
      }
    }
  }

  visit(startAssetId, [startAssetId], [], new Set([startAssetId]), 0, []);

  const finalPaths = targetSet.size > 0
    ? pathResults.filter((path) => path.path.length > 0 && targetSet.has(path.path[path.path.length - 1]))
    : pathResults;

  const orderedPaths = [...finalPaths].sort((left, right) => {
    const leftKey = left.path.join('>');
    const rightKey = right.path.join('>');
    return leftKey.localeCompare(rightKey);
  });

  return {
    paths: orderedPaths.slice(0, maxPaths),
    warnings: asWarningsUnique(warnings),
    summary: {
      assetsAnalyzed: normalizedAssets.length,
      relationshipsAnalyzed: relationships.length,
      maxDepth,
      maxPaths,
      startAssetId
    }
  };
}
