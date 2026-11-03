import type { NextRequest } from 'next/server';

/**
 * Validate a browser Origin against the host that actually received the request.
 * Comparing Origin to NextURL.origin alone can reject valid requests when the
 * framework canonicalizes the internal URL behind a local/proxy host.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const originHeader = request.headers.get('origin');
  const hostHeader = request.headers.get('host');

  if (!originHeader || !hostHeader) return false;

  try {
    const origin = new URL(originHeader);
    const expectedOrigin = new URL(`${request.nextUrl.protocol}//${hostHeader}`);
    return origin.origin === expectedOrigin.origin;
  } catch {
    return false;
  }
}
