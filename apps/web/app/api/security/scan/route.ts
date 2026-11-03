import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SESSION_COOKIE = 'nexus_access_token';
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;

function configuredUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function apiBaseUrl(): URL | null {
  return configuredUrl(process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL);
}

function aiBaseUrl(): URL | null {
  return configuredUrl(process.env.AI_BASE_URL);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SCAN_ERROR_MESSAGES: Record<string, string> = {
  SCANNER_AUTH_NOT_CONFIGURED: 'The internal scanner credential is not configured.',
  QUARANTINE_NOT_CONFIGURED: 'Private quarantine storage is not configured.',
  QUARANTINE_UNAVAILABLE: 'Private quarantine storage is not available. No scan was reported.',
  SCANNER_UNAVAILABLE: 'ClamAV is not available. The sample remains in private quarantine and can be retried.',
  SCANNER_TIMEOUT: 'The scan timed out. The sample remains in private quarantine and can be retried.',
  SCANNER_ERROR: 'ClamAV could not complete the scan. The sample remains in private quarantine.',
  UPLOAD_TOO_LARGE: 'The maximum file size is 100 MiB.',
  CONTENT_LENGTH_REQUIRED: 'The upload request must include a content length.',
  INVALID_MULTIPART: 'The upload form could not be read. Select one file and try again.'
};

async function scannerResponse(upstream: Response) {
  const payload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const detail = isRecord(payload) && isRecord(payload.detail) ? payload.detail : {};
    const code = typeof detail.code === 'string' ? detail.code : 'SCAN_FAILED';
    const sampleId = typeof detail.sample_id === 'string' && SHA256_PATTERN.test(detail.sample_id)
      ? detail.sample_id
      : undefined;
    const status = [400, 401, 404, 411, 413, 415, 422, 502, 503, 504].includes(upstream.status)
      ? upstream.status
      : 502;
    return NextResponse.json({
      error: code,
      message: SCAN_ERROR_MESSAGES[code] ?? 'The file scan could not be completed.',
      sample_id: sampleId
    }, {
      status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const scan = isRecord(payload) && isRecord(payload.scan) ? payload.scan : null;
  if (
    !scan ||
    (scan.verdict !== 'clean' && scan.verdict !== 'detected') ||
    typeof scan.sample_id !== 'string' ||
    !SHA256_PATTERN.test(scan.sample_id) ||
    typeof scan.sha256 !== 'string' ||
    typeof scan.size_bytes !== 'number' ||
    typeof scan.scanned_at !== 'string'
  ) {
    return NextResponse.json(
      { error: 'INVALID_SCANNER_RESPONSE', message: 'The scanner returned an invalid result.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({
    status: 'ok',
    scan: {
      sample_id: scan.sample_id,
      sha256: scan.sha256,
      size_bytes: scan.size_bytes,
      verdict: scan.verdict,
      scanner: 'ClamAV clamdscan',
      scanned_at: scan.scanned_at,
      execution_performed: false,
      disclaimer: typeof scan.disclaimer === 'string'
        ? scan.disclaimer
        : 'A clean signature scan does not guarantee that a file is harmless.'
    }
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
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

  const apiBase = apiBaseUrl();
  const aiBase = aiBaseUrl();
  if (!apiBase || !aiBase) {
    return NextResponse.json({ error: 'SCANNER_SERVICE_UNAVAILABLE' }, { status: 503 });
  }

  let identity: Response;
  try {
    identity = await fetch(new URL('/api/auth/me', apiBase), {
      headers: { Authorization: 'Bearer ' + sessionToken, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 });
  }

  const identityPayload: unknown = await identity.json().catch(() => null);
  if (!identity.ok || !isRecord(identityPayload) || !isRecord(identityPayload.user)) {
    const response = NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    response.cookies.delete(SESSION_COOKIE);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const role = identityPayload.user.role;
  if (role !== 'admin' && role !== 'analyst') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const serviceToken = process.env.NEXUS_SERVICE_API_TOKEN;
  if (!serviceToken || serviceToken.length < 32) {
    return NextResponse.json({ error: 'SCANNER_AUTH_NOT_CONFIGURED' }, { status: 503 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const targetIsUpload = contentType.toLowerCase().startsWith('multipart/form-data;')
    && contentType.toLowerCase().includes('boundary=');
  const targetIsRetry = contentType.toLowerCase().startsWith('application/json');

  if (targetIsRetry) {
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > 1024) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    if (
      !isRecord(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.sample_id !== 'string' ||
      !SHA256_PATTERN.test(body.sample_id)
    ) {
      return NextResponse.json({ error: 'INVALID_SAMPLE_ID' }, { status: 400 });
    }

    try {
      const upstream = await fetch(new URL('/scan-file', aiBase), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + serviceToken,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ sample_id: body.sample_id }),
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(90000)
      });
      return scannerResponse(upstream);
    } catch {
      return NextResponse.json(
        { error: 'SCANNER_SERVICE_UNAVAILABLE', message: 'The internal scanner service could not be reached.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  if (!targetIsUpload) {
    return NextResponse.json({ error: 'UNSUPPORTED_CONTENT_TYPE' }, { status: 415 });
  }

  const rawLength = request.headers.get('content-length');
  if (!rawLength) {
    return NextResponse.json({ error: 'CONTENT_LENGTH_REQUIRED' }, { status: 411 });
  }
  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    return NextResponse.json({ error: 'INVALID_CONTENT_LENGTH' }, { status: 400 });
  }
  if (contentLength > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json({ error: 'UPLOAD_TOO_LARGE', message: SCAN_ERROR_MESSAGES.UPLOAD_TOO_LARGE }, { status: 413 });
  }
  if (!request.body) {
    return NextResponse.json({ error: 'EMPTY_REQUEST' }, { status: 400 });
  }

  const headers = new Headers({
    Authorization: 'Bearer ' + serviceToken,
    Accept: 'application/json',
    'Content-Type': contentType,
    'Content-Length': String(contentLength)
  });
  const upstreamRequest = {
    method: 'POST',
    headers,
    body: request.body,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(150000),
    duplex: 'half'
  } as RequestInit & { duplex: 'half' };

  try {
    const upstream = await fetch(new URL('/scan-upload', aiBase), upstreamRequest);
    return scannerResponse(upstream);
  } catch {
    return NextResponse.json(
      { error: 'SCANNER_SERVICE_UNAVAILABLE', message: 'The internal scanner service could not be reached.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
