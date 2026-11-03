import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '../../../../api/origin';

const SESSION_COOKIE = 'nexus_access_token';
const SESSION_MAX_AGE_SECONDS = 15 * 60;

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('email' in body) ||
    !('password' in body) ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 1 ||
    password.length > 128
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const base = apiBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 });
  }

  try {
    const upstream = await fetch(new URL('/api/auth/login', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });

    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: upstream.status === 401 ? 'INVALID_CREDENTIALS' : 'AUTH_SERVICE_UNAVAILABLE',
          message: upstream.status === 401
            ? 'The email or password is incorrect.'
            : 'Authentication is temporarily unavailable.'
        },
        { status: upstream.status === 401 ? 401 : 503 }
      );
    }

    if (
      !payload ||
      typeof payload.access_token !== 'string' ||
      typeof payload.user !== 'object' ||
      payload.user === null
    ) {
      return NextResponse.json({ error: 'INVALID_AUTH_RESPONSE' }, { status: 502 });
    }

    const response = NextResponse.json({
      status: 'ok',
      user: payload.user,
      expires_in: SESSION_MAX_AGE_SECONDS
    });

    response.cookies.set(SESSION_COOKIE, payload.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' },
      { status: 503 }
    );
  }
}
