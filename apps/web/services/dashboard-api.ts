import { apiRequest } from '../api/client';

export type UserRole = 'admin' | 'analyst' | 'viewer';
export interface ManagedUser { id: string; email: string; role: UserRole; status: 'active' | 'invited' | 'revoked'; createdAt: string; }
export interface Workspace { id: string; name: string; slug: string; role: UserRole; }
export interface ThreatSummary {
  is_demo: boolean;
  data_source: string;
  summary: { total_incidents: number; critical: number; mitigated: number; ai_score: number | null; updated_at: string };
}
export interface Incident {
  id: string; title: string; severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
  source: string | null; createdAt: string; updatedAt: string;
}
export interface Alert {
  id: string; incidentId: string | null; incidentTitle: string | null; incidentSeverity: string | null;
  incidentStatus: string | null; type: string; riskScore: number;
  status: 'active' | 'acknowledged' | 'resolved'; createdAt: string;
}
export interface SecurityEvent {
  id: string; source: string; externalEventId: string; eventType: string;
  severity: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  observedAt: string; receivedAt: string; assetId: string | null; summary: string;
  attributes: Record<string, string>; reviewStatus: 'new' | 'reviewed';
  reviewedAt: string | null; reviewedByUserId: string | null;
  ocsfEvent?: Record<string, unknown> | null;
}
export interface ThreatAnalysisResult {
  target: string; source: string; provider: string; model: string;
  classification: 'low' | 'medium' | 'high' | 'critical'; risk_score: number;
  findings: string[]; recommendations: string[]; explanation: string; disclaimer: string;
}
interface ListResult<T> {
  status: string;
  pagination: { total: number; limit: number; offset: number; has_more: boolean };
  incidents?: T[];
  alerts?: T[];
  events?: T[];
}

export interface DashboardData {
  incidents: Incident[]; alerts: Alert[]; securityEvents: SecurityEvent[]; ipsEvents: SecurityEvent[];
  incidentTotal: number; alertTotal: number; securityEventTotal: number; ipsEventTotal: number;
  summary: ThreatSummary | null; managedUsers: ManagedUser[];
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const result = await apiRequest<{ workspaces?: Workspace[] }>('/api/nexus/workspaces');
  return result.workspaces ?? [];
}

export function createWorkspace(name: string) {
  return apiRequest<{ workspace: Workspace }>('/api/nexus/workspaces', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
}

export function addWorkspaceMember(input: { email: string; role: 'analyst' | 'viewer' }) {
  return apiRequest<{ member: ManagedUser }>('/api/nexus/workspaces/members', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  });
}

/** Load authenticated dashboard data through same-origin Next.js API routes only. */
export async function fetchDashboardData(isAdmin: boolean): Promise<DashboardData> {
  const [incidentsResult, alertsResult, eventsResult, ipsEventsResult, summaryResult, membersResult] = await Promise.all([
    apiRequest<ListResult<Incident>>('/api/nexus/incidents?limit=100'),
    apiRequest<ListResult<Alert>>('/api/nexus/alerts?limit=100'),
    apiRequest<ListResult<SecurityEvent>>('/api/nexus/security-events?limit=100'),
    apiRequest<ListResult<SecurityEvent>>('/api/nexus/security-events?source=nexus-ips&limit=100'),
    apiRequest<ThreatSummary>('/api/nexus/threats/summary').catch(() => null),
    isAdmin ? apiRequest<{ members?: ManagedUser[] }>('/api/nexus/workspaces/members') : Promise.resolve({ members: [] })
  ]);

  return {
    incidents: incidentsResult.incidents ?? [],
    alerts: alertsResult.alerts ?? [],
    securityEvents: eventsResult.events ?? [],
    ipsEvents: ipsEventsResult.events ?? [],
    incidentTotal: incidentsResult.pagination?.total ?? 0,
    alertTotal: alertsResult.pagination?.total ?? 0,
    securityEventTotal: eventsResult.pagination?.total ?? 0,
    ipsEventTotal: ipsEventsResult.pagination?.total ?? 0,
    summary: summaryResult,
    managedUsers: membersResult.members ?? []
  };
}

export function createIncidentRecord(input: { title: string; severity: Incident['severity']; source?: string }) {
  return apiRequest<{ incident: Incident }>('/api/nexus/incidents', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  });
}

export function createAlertRecord(incidentId: string, input: { type: string; riskScore: number }) {
  return apiRequest<{ alert: Alert }>(`/api/nexus/incidents/${encodeURIComponent(incidentId)}/alerts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  });
}

export function analyzeThreat(input: { target: string; source: string; signal_type?: string; details?: string }) {
  return apiRequest<{ analysis: ThreatAnalysisResult }>('/api/ai/threat-analysis', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  });
}

export function reviewSecurityEvent(eventId: string) {
  return apiRequest<{ status: string }>(`/api/nexus/security-events/${encodeURIComponent(eventId)}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'Reviewed by an authenticated dashboard user.' })
  });
}

export function createManagedUser(input: { email: string; role: 'analyst' | 'viewer' }) {
  return addWorkspaceMember(input);
}

export function changeIncidentStatus(incidentId: string, status: Incident['status']) {
  return apiRequest<{ incident: Incident }>(`/api/nexus/incidents/${encodeURIComponent(incidentId)}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note: 'Updated by an authenticated dashboard user.' })
  });
}

export function changeAlertStatus(alertId: string, status: Alert['status']) {
  return apiRequest<{ alert: Alert }>(`/api/nexus/alerts/${encodeURIComponent(alertId)}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note: 'Updated by an authenticated dashboard user.' })
  });
}
