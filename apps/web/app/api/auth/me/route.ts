import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'nexus_access_token';

function apiBaseUrl(): URL | null {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const base = apiBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 });
  }

  try {
    const upstream = await fetch(new URL('/api/auth/me', base), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    const payload = await upstream.json().catch(() => null);

    if (upstream.status === 401) {
      // Clear the browser copy only when the API explicitly confirms that the
      // session is unauthenticated, expired or revoked.
      const response = NextResponse.json(
        { error: 'UNAUTHENTICATED' },
        { status: 401 }
      );
      response.cookies.delete(SESSION_COOKIE);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    if (!upstream.ok) {
      // Do not turn a temporary session-store/database outage into a local
      // sign-out. Keep the HttpOnly cookie so the user can retry after recovery.
      const response = NextResponse.json(
        { error: 'AUTH_SERVICE_UNAVAILABLE' },
        { status: 503 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const response = NextResponse.json(payload);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 });
  }
}
