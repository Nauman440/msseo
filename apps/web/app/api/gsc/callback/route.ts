import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { exchangeGscCode } from '@seo/core';
import { saveGscConnection } from '@seo/db';
import { googleOAuth, GSC_STATE_COOKIE, publicOrigin } from '@/lib/google-oauth';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const back = (req: NextRequest, query: string) => {
  const res = NextResponse.redirect(new URL(`/settings/search-console?${query}`, publicOrigin(req.headers)));
  res.cookies.delete({ name: GSC_STATE_COOKIE, path: '/api/gsc' });
  return res;
};

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** GET /api/gsc/callback — Google returns here; stores the encrypted refresh token. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return new NextResponse('Only admins can connect Search Console.', { status: 403 });

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return back(req, `error=${encodeURIComponent(`Google: ${params.get('error')}`)}`);
  const state = params.get('state') ?? '';
  const expected = req.cookies.get(GSC_STATE_COOKIE)?.value ?? '';
  if (!state || !expected || !same(state, expected)) return back(req, `error=${encodeURIComponent('The sign-in link expired. Please try again.')}`);

  try {
    const { refreshToken, email, scopes } = await exchangeGscCode(googleOAuth(req.headers), params.get('code') ?? '');
    if (!scopes.includes('webmasters')) return back(req, `error=${encodeURIComponent('Search Console access was not granted. Tick the Search Console box on the Google screen.')}`);
    await saveGscConnection({ email, refreshToken, scopes });
    return back(req, 'connected=1');
  } catch (err) {
    return back(req, `error=${encodeURIComponent(err instanceof Error ? err.message : 'Could not connect Search Console.')}`);
  }
}
