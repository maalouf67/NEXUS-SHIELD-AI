export type EvidenceStatus = 'verified' | 'unverified' | 'stale' | 'missing';

export interface EvidenceReference {
  id: string;
  source: string;
  status: EvidenceStatus;
  recordedAt: string;
  note?: string;
}

export interface Asset {
  id: string;
  type: string;
  name: string;
  description?: string;
  evidence: EvidenceReference[];
  tags?: string[];
  properties?: Record<string, unknown>;
}

export interface AssetRelationship {
  id: string;
  fromAssetId: string;
  toAssetId: string;
  relationshipType: string;
  evidence: EvidenceReference[];
  notes?: string;
}

export interface ValidationWarning {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  assetId?: string;
  relationshipId?: string;
  evidenceId?: string;
}

export interface AssetPath {
  path: string[];
  relationshipIds: string[];
  evidence: EvidenceReference[];
}

export interface AnalysisInput {
  assets: Asset[];
  relationships: AssetRelationship[];
  startAssetId?: string;
  targetAssetIds?: string[];
  maxDepth?: number;
  maxPaths?: number;
}

export interface AnalysisOutput {
  paths: AssetPath[];
  warnings: ValidationWarning[];
  summary: {
    assetsAnalyzed: number;
    relationshipsAnalyzed: number;
    maxDepth: number;
    maxPaths: number;
    startAssetId: string | null;
  };
}
