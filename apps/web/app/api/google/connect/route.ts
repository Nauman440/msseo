import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { CUSTOMER_GOOGLE_SCOPES, gscAuthUrl, normDomain } from '@seo/core';
import { accountSites, domainOf, getAccountByUserId } from '@/lib/accounts';
import { usingDatabase } from '@/lib/audit-store';
import { GOOGLE_FLOW_COOKIE, googleOAuth, GSC_STATE_COOKIE, publicOrigin } from '@/lib/google-oauth';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/google/connect?site=example.com — a customer connects their own Google account
 * (Search Console + Analytics 4, read-only). Google returns to the same /api/gsc/callback the
 * team uses (one registered redirect URI); a flow cookie tells the callback it is a customer.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.id || user.role !== 'customer') return NextResponse.redirect(new URL('/login?next=/my', publicOrigin(req.headers)));
  const account = await getAccountByUserId(user.id);
  const site = normDomain(req.nextUrl.searchParams.get('site') ?? '');
  const sites = account ? accountSites(account).map(domainOf) : [];
  const domain = sites.includes(site) ? site : sites[0];
  const back = (msg: string) => NextResponse.redirect(new URL(`/my/connections?site=${encodeURIComponent(domain ?? '')}&error=${encodeURIComponent(msg)}`, publicOrigin(req.headers)));
  if (!domain) return NextResponse.redirect(new URL('/my', publicOrigin(req.headers)));

  const db = usingDatabase() ? await import('@seo/db') : null;
  if (!db?.customerGoogleReady()) return back('Connecting Google is not available yet. Please try again later, or contact us if you need it now.');

  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(gscAuthUrl(googleOAuth(req.headers), state, CUSTOMER_GOOGLE_SCOPES));
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  // Lax so the cookies come back on Google's top-level redirect; 10 minutes to finish signing in.
  res.cookies.set(GSC_STATE_COOKIE, state, { httpOnly: true, secure, sameSite: 'lax', path: '/api/gsc', maxAge: 600 });
  res.cookies.set(GOOGLE_FLOW_COOKIE, `customer:${domain}`, { httpOnly: true, secure, sameSite: 'lax', path: '/api/gsc', maxAge: 600 });
  return res;
}
