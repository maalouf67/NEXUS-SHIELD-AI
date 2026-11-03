import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '../../../../api/origin';

const SESSION_COOKIE = 'nexus_access_token';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const response = NextResponse.json({ status: 'signed_out' });
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
