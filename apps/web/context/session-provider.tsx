'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiClientError } from '../api/client';
import { endCurrentSession, fetchCurrentUser, type SessionUser } from '../services/nexus-api';
import { SessionContext, type SessionStatus } from './session-context';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setStatus('checking');
    setError('');
    try {
      setUser(await fetchCurrentUser());
      setStatus('authenticated');
    } catch (cause) {
      setUser(null);
      if (cause instanceof ApiClientError && cause.status === 401) {
        if (typeof window !== 'undefined') window.localStorage.removeItem('nexus.activeWorkspaceId');
        setStatus('anonymous');
        return;
      }
      setStatus('unavailable');
      setError(cause instanceof Error ? cause.message : 'The authentication service is unavailable.');
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await endCurrentSession();
    } finally {
      if (typeof window !== 'undefined') window.localStorage.removeItem('nexus.activeWorkspaceId');
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(
    () => ({ user, status, error, refresh, signOut }),
    [user, status, error, refresh, signOut]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
