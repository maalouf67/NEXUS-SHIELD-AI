export type RiskLevel = 'low' | 'monitor' | 'elevated' | 'critical';

export interface ThreatSignal {
  id: string;
  source: string;
  target: string;
  classification: RiskLevel;
  score: number;
  createdAt: string;
}

export interface SecuritySummary {
  totalIncidents: number;
  critical: number;
  mitigated: number;
  aiScore: number;
  updatedAt: string;
}
