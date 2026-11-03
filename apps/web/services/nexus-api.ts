import { apiRequest } from '../api/client';

export type UserRole = 'admin' | 'analyst' | 'viewer';
export interface SessionUser { id: string; email: string; role: UserRole; }

export interface ScanHistoryItem {
  id: string;
  sampleId: string;
  sha256: string;
  sizeBytes: number;
  verdict: 'pending' | 'clean' | 'detected' | 'error' | 'timeout';
  scanner: string;
  errorCode: string | null;
  scannedAt: string | null;
  createdAt: string;
  sampleExpiresAt: string;
  storageDeletedAt: string | null;
}

export async function fetchCurrentUser(): Promise<SessionUser> {
  const result = await apiRequest<{ user: SessionUser }>('/api/auth/me');
  return result.user;
}

export async function endCurrentSession(): Promise<void> {
  await apiRequest<{ status: string }>('/api/auth/logout', { method: 'POST' });
}

export async function fetchScanHistory(limit = 10): Promise<ScanHistoryItem[]> {
  const result = await apiRequest<{ scans?: ScanHistoryItem[] }>(
    `/api/security/scan?limit=${encodeURIComponent(String(limit))}`
  );
  return result.scans ?? [];
}
