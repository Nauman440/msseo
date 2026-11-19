import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { GBP_SCOPES, gscAuthUrl, normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { gbpConnectReady } from '@/lib/gbp';
import { GOOGLE_FLOW_COOKIE, googleOAuth, GSC_STATE_COOKIE, publicOrigin } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gbp/connect?site=example.com — connect the site's Google Business Profile (scope
 * business.manage) for the team or the site's customer. Google returns to the shared
 * /api/gsc/callback; the flow cookie "gbp:<domain>" tells it what to store.
 */
export async function GET(req: NextRequest) {
  const domain = normDomain(req.nextUrl.searchParams.get('site') ?? '');
  const viewer = domain ? await competitorAccess(domain) : null;
  const origin = publicOrigin(req.headers);
  if (!viewer) return NextResponse.redirect(new URL('/login', origin));
  const page = viewer.kind === 'customer' ? `/my/local?site=${encodeURIComponent(domain)}` : `/local/${domain}`;
  if (!gbpConnectReady()) return NextResponse.redirect(new URL(`${page}${page.includes('?') ? '&' : '?'}gbpError=${encodeURIComponent('Connecting a Business Profile is not set up on this server yet.')}`, origin));

  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(gscAuthUrl(googleOAuth(req.headers), state, GBP_SCOPES));
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set(GSC_STATE_COOKIE, state, { httpOnly: true, secure, sameSite: 'lax', path: '/api/gsc', maxAge: 600 });
  res.cookies.set(GOOGLE_FLOW_COOKIE, `gbp:${domain}`, { httpOnly: true, secure, sameSite: 'lax', path: '/api/gsc', maxAge: 600 });
  return res;
}
