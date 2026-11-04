export type RiskLevel = "low" | "monitor" | "elevated" | "critical";

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

export type PhoneReputationVerdict = "malicious" | "suspicious" | "safe" | "unknown";

export interface PhoneReputationCheck {
  provider: "ipqualityscore";
  verdict: PhoneReputationVerdict;
  scanned_phone: string;
  fraud_score: number | null;
  number_valid: boolean | null;
  recent_abuse: boolean | null;
  risky: boolean | null;
  spammer: boolean | null;
  active: boolean | null;
  carrier: string | null;
  phone_type: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  provider_request_id: string | null;
  message: string;
}