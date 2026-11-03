import type { ReactNode } from 'react';

type Status = 'clean' | 'detected' | 'pending';
const statusClasses: Record<Status, string> = {
  clean: 'scan-status-clean',
  detected: 'scan-status-detected',
  pending: 'scan-status-pending'
};

export function StatusBadge({ status, children }: { status: Status; children: ReactNode }) {
  return <span className={statusClasses[status]} role="status">{children}</span>;
}
