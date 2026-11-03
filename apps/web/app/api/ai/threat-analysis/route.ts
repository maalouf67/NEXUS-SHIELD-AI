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

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const base = apiBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'API_UNAVAILABLE' }, { status: 503 });
  }

  const serviceToken = process.env.NEXUS_SERVICE_API_TOKEN;
  if (!serviceToken || serviceToken.length < 32) {
    return NextResponse.json({
      error: 'AI_SERVICE_NOT_CONFIGURED',
      message: 'The server-side AI service credential is not configured.'
    }, { status: 503 });
  }

  let user: { id: string; email: string; role: string };
  try {
    const identityResponse = await fetch(new URL('/api/auth/me', base), {
      headers: { Authorization: `Bearer ${sessionToken}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    const identityPayload = await identityResponse.json().catch(() => null);

    if (!identityResponse.ok || !identityPayload?.user) {
      const response = NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    user = identityPayload.user as { id: string; email: string; role: string };
  } catch {
    return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 });
  }

  if (user.role !== 'admin' && user.role !== 'analyst') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const allowedKeys = new Set(['target', 'source', 'signal_type', 'details']);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const target = typeof input.target === 'string' ? input.target.trim() : '';
  const source = typeof input.source === 'string' ? input.source.trim() : '';
  const signalType = input.signal_type === undefined ? undefined : input.signal_type;
  const details = input.details === undefined ? undefined : input.details;

  if (
    target.length < 1 ||
    target.length > 200 ||
    source.length < 1 ||
    source.length > 200 ||
    (signalType !== undefined && (typeof signalType !== 'string' || signalType.length > 100)) ||
    (details !== undefined && (typeof details !== 'string' || details.length > 5000))
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  try {
    const upstream = await fetch(new URL('/api/threats/analyze', base), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-NEXUS-USER-ID': user.id
      },
      body: JSON.stringify({
        target,
        source,
        signal_type: signalType,
        details
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(45000)
    });

    const result = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const status = [401, 403, 422, 429, 503, 504].includes(upstream.status)
        ? upstream.status
        : 502;
      return NextResponse.json(
        {
          error: typeof result?.error === 'string' ? result.error : 'AI_ANALYSIS_FAILED',
          message: typeof result?.message === 'string'
            ? result.message
            : typeof result?.detail === 'string'
              ? result.detail
              : 'The AI analysis could not be completed.'
        },
        { status }
      );
    }

    const response = NextResponse.json({
      status: 'ok',
      analysis: result,
      initiated_by: { id: user.id, role: user.role },
      persisted: false,
      external_scan_performed: false
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'AI_SERVICE_UNAVAILABLE', message: 'The AI analysis service could not be reached.' },
      { status: 503 }
    );
  }
}
