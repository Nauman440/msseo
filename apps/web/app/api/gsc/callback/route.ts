import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { exchangeGscCode } from '@seo/core';
import { saveCustomerGoogle, saveGscConnection } from '@seo/db';
import { GOOGLE_FLOW_COOKIE, googleOAuth, GSC_STATE_COOKIE, publicOrigin } from '@/lib/google-oauth';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * GET /api/gsc/callback — Google returns here (the one registered redirect URI) for both:
 *  - the team's agency Search Console connection (admin, from Settings → Search Console), and
 *  - a customer's own Google connection (Search Console + Analytics 4, from their dashboard).
 * Stores the encrypted refresh token.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const flow = req.cookies.get(GOOGLE_FLOW_COOKIE)?.value ?? '';
  const customer = user?.role === 'customer' && flow.startsWith('customer:') ? flow.slice('customer:'.length) : null;

  const back = (query: string) => {
    const path = customer !== null ? (query.startsWith('connected') ? `/my/connect?site=${encodeURIComponent(customer)}` : `/my/connections?site=${encodeURIComponent(customer)}&${query}`) : `/settings/search-console?${query}`;
    const res = NextResponse.redirect(new URL(path, publicOrigin(req.headers)));
    res.cookies.delete({ name: GSC_STATE_COOKIE, path: '/api/gsc' });
    res.cookies.delete({ name: GOOGLE_FLOW_COOKIE, path: '/api/gsc' });
    return res;
  };
  if (!user || (customer === null && user.role !== 'admin')) return new NextResponse('Only admins can connect the team Search Console.', { status: 403 });

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return back(`error=${encodeURIComponent(params.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : `Google: ${params.get('error')}`)}`);
  const state = params.get('state') ?? '';
  const expected = req.cookies.get(GSC_STATE_COOKIE)?.value ?? '';
  if (!state || !expected || !same(state, expected)) return back(`error=${encodeURIComponent('The sign-in link expired. Please try again.')}`);

  try {
    const { refreshToken, email, scopes } = await exchangeGscCode(googleOAuth(req.headers), params.get('code') ?? '');
    if (!scopes.includes('webmasters')) return back(`error=${encodeURIComponent('Search Console access was not granted. Tick the Search Console box on the Google screen.')}`);
    if (customer !== null) await saveCustomerGoogle(user.id!, { email, refreshToken, scopes });
    else await saveGscConnection({ email, refreshToken, scopes });
    return back('connected=1');
  } catch (err) {
    return back(`error=${encodeURIComponent(err instanceof Error ? err.message : 'Could not connect Google.')}`);
  }
}
