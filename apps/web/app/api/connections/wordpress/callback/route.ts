import { NextResponse, type NextRequest } from 'next/server';
import { createWordPressClient, type SiteConnection } from '@seo/core';
import { encryptSecret } from '@seo/core/server';
import { sameSite, saveConnection } from '@/lib/connections';
import { clearState, readState, withMessage } from '@/lib/connect-flow';
import { publicOrigin } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/connections/wordpress/callback — WordPress returns site_url, user_login and password
 * (or success=false / rejected=1). The password is checked, encrypted and saved; it is never logged.
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers);
  const p = req.nextUrl.searchParams;
  const state = readState(req, p.get('state'));
  if (!state) return NextResponse.redirect(new URL('/', origin));
  const done = (key: 'error' | 'connected', value: string) => clearState(withMessage(origin, state.back, key, value));
  if (p.get('rejected') === '1' || p.get('success') === 'false') return done('error', 'The connection was not approved in WordPress.');

  const siteUrl = (p.get('site_url') ?? '').replace(/\/+$/, '');
  const user = p.get('user_login') ?? '';
  const password = p.get('password') ?? '';
  let host = '';
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    // Checked below.
  }
  if (!user || !password || !siteUrl.startsWith('https://') || !sameSite(host, state.domain)) return done('error', 'WordPress did not return a usable connection. Please try again.');

  const wp = createWordPressClient({ siteUrl, user, password });
  try {
    const me = await wp.me();
    if (!me.canEdit) return done('error', 'This WordPress user cannot edit pages. Connect with an editor or administrator.');
  } catch {
    return done('error', 'WordPress did not accept the new application password. A security plugin may block it.');
  }
  const now = new Date().toISOString();
  const c: SiteConnection = {
    domain: state.domain,
    platform: 'wordpress',
    siteUrl,
    account: user,
    secret: encryptSecret(JSON.stringify({ password })),
    scopes: null,
    plugin: await wp.plugin(),
    status: 'ok',
    error: null,
    connectedAt: now,
    connectedBy: state.by,
    checkedAt: now,
  };
  await saveConnection(c);
  return done('connected', 'wordpress');
}
