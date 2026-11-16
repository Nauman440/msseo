import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { gscAuthUrl } from '@seo/core';
import { gscSetup } from '@seo/db';
import { googleOAuth, GSC_STATE_COOKIE } from '@/lib/google-oauth';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** GET /api/gsc/connect — admin only: sends the browser to Google's consent screen. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return new NextResponse('Only admins can connect Search Console.', { status: 403 });
  const setup = gscSetup();
  if (!setup.ready) return NextResponse.redirect(new URL(`/settings/search-console?error=${encodeURIComponent(`Missing: ${setup.missing.join(', ')}`)}`, req.url));

  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(gscAuthUrl(googleOAuth(req.headers), state));
  // Lax so the cookie comes back on Google's top-level redirect; 10 minutes to finish signing in.
  res.cookies.set(GSC_STATE_COOKIE, state, { httpOnly: true, secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https', sameSite: 'lax', path: '/api/gsc', maxAge: 600 });
  return res;
}
