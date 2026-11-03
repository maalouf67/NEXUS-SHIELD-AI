export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '100 MiB';
export const SCAN_ALLOWED_ROLES = ['admin', 'analyst'] as const;
export type ScanVerdict = 'pending' | 'clean' | 'detected' | 'error' | 'timeout';

export function canSubmitFileScan(role: string | undefined): boolean {
  return role === 'admin' || role === 'analyst';
}
