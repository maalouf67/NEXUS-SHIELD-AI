export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number, public readonly payload: unknown) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const value = (payload as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim()) return value;
  }
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

/** Browser calls are restricted to same-origin Next.js API routes. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/')) {
    throw new Error('Only same-origin /api routes may be called from the web client.');
  }

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  const workspaceScoped = [
    '/api/nexus/incidents',
    '/api/nexus/alerts',
    '/api/nexus/security-events',
    '/api/nexus/threats',
    '/api/nexus/assets',
    '/api/nexus/attack-paths',
    '/api/nexus/workspaces/members',
    '/api/nexus/workspaces/integrations'
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));

  if (workspaceScoped && typeof window !== 'undefined') {
    const workspaceId = window.localStorage.getItem('nexus.activeWorkspaceId');
    if (workspaceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
      headers.set('X-NEXUS-WORKSPACE-ID', workspaceId);
    }
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiClientError(messageFrom(payload, 'The requested service is currently unavailable.'), response.status, payload);
  }
  return payload as T;
}
