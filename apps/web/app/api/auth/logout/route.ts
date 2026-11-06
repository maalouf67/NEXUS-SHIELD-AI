import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '../../../../api/origin';

const SESSION_COOKIE = 'nexus_access_token';

function apiBaseUrl(): URL | null {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function clearSessionCookie(response: NextResponse) {
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

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return clearSessionCookie(NextResponse.json({
      status: 'signed_out',
      session_revocation: 'no_session'
    }));
  }

  const base = apiBaseUrl();
  if (!base) {
    // Keep the cookie so the caller can retry; do not claim the server session
    // was revoked when the API endpoint is not configured.
    return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 });
  }

  try {
    const upstream = await fetch(new URL('/api/auth/logout', base), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });

    if (upstream.status === 204) {
      return clearSessionCookie(NextResponse.json({
        status: 'signed_out',
        session_revocation: 'revoked'
      }));
    }

    if (upstream.status === 401) {
      // The API no longer accepts this session (expired or already revoked).
      return clearSessionCookie(NextResponse.json({
        status: 'signed_out',
        session_revocation: 'already_inactive'
      }));
    }

    // Preserve the browser cookie on an unavailable/unknown upstream result so
    // the user can retry server revocation. No token or upstream body is exposed.
    return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 });
  } catch {
    return NextResponse.json(
      { error: 'AUTH_SERVICE_UNAVAILABLE', message: 'Server sign-out could not be confirmed. Retry.' },
      { status: 503 }
    );
  }
}
