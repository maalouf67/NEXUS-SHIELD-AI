import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from 

const SESSION_COOKIE = 'nexus_access_token';
const ALLOWED_ROOTS = new Set([
  'incidents',
  'alerts',
  'threats',
  'users',
  'security-events'
]);
const MAX_BODY_BYTES = 1024 * 1024;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

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

async function proxy(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { path } = await context.params;
  if (!path?.length || !ALLOWED_ROOTS.has(path[0])) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (!origin || !isSameOriginRequest(request)) {
      return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
    }
  }

  const base = apiBaseUrl();
  if (!base) {
    return NextResponse.json({ error: 'API_UNAVAILABLE' }, { status: 503 });
  }

  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const target = new URL(`/api/${encodedPath}`, base);
  target.search = request.nextUrl.search;

  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  });

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET') {
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    }
    body = rawBody;
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });

    const responseBody = await upstream.arrayBuffer();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store'
      }
    });

    if (upstream.status === 401) {
      response.cookies.delete(SESSION_COOKIE);
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: 'API_UNAVAILABLE', message: 'The API service could not be reached.' },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
