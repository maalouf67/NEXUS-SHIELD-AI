import { createContext } from 'react';
import type { SessionUser } from '../services/nexus-api';

export type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'unavailable';
export interface SessionContextValue {
  user: SessionUser | null;
  status: SessionStatus;
  error: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
export const SessionContext = createContext<SessionContextValue | undefined>(undefined);
