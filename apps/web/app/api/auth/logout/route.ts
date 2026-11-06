import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '../../../../api/origin';

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

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let serverSessionInvalidated = !token;

  if (token) {
    const base = apiBaseUrl();
    if (base) {
      try {
        const upstream = await fetch(new URL('/api/auth/logout', base), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(10000)
        });
        // A successful logout revoked it. A 401 means the token was already
        // expired, unknown or revoked, so it is no longer an active session.
        serverSessionInvalidated = upstream.ok || upstream.status === 401;
      } catch {
        serverSessionInvalidated = false;
      }
    }
  }

  // Always clear the browser copy even when the API is unreachable. The
  // response explicitly reports whether server-side invalidation was confirmed.
  const response = NextResponse.json({
    status: 'signed_out',
    server_session_invalidated: serverSessionInvalidated,
    ...(serverSessionInvalidated ? {} : {
      warning: 'The browser session was cleared locally, but server-side revocation could not be confirmed.'
    })
  });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
