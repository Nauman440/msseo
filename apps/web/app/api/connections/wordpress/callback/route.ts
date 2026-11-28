import { NextResponse, type NextRequest } from 'next/server';
import { createWordPressClient, pluginSupportsSigning, type SiteConnection, type WordPressSecret } from '@seo/core';
import { decryptSecret, encryptSecret, wordpressSession } from '@seo/core/server';
import { getConnection, sameSite, saveConnection } from '@/lib/connections';
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
  if (!user || !password || !siteUrl.startsWith('https://') || !host || !sameSite(siteUrl, state.domain)) return done('error', 'WordPress did not return a usable connection. Please try again.');

  // Reconnecting: keep the signing key the plugin already has, so its signed routes keep working.
  const previous = await getConnection(state.domain);
  let signingKey: string | undefined;
  if (previous?.platform === 'wordpress') {
    try {
      signingKey = (JSON.parse(decryptSecret(previous.secret)) as WordPressSecret).signingKey;
    } catch {
      signingKey = undefined;
    }
  }
  const wp = createWordPressClient({ siteUrl, user, password, signingKey });
  try {
    const me = await wp.me();
    if (!me.canEdit) return done('error', 'This WordPress user cannot edit pages. Connect with an editor or administrator.');
  } catch {
    return done('error', 'WordPress did not accept the new application password. A security plugin may block it.');
  }
  let plugin: SiteConnection['plugin'];
  try {
    plugin = await wp.plugin();
  } catch (err) {
    return done('error', err instanceof Error ? err.message : 'The plugin did not answer.');
  }
  const now = new Date().toISOString();
  const c: SiteConnection = {
    domain: state.domain,
    platform: 'wordpress',
    siteUrl,
    account: user,
    secret: encryptSecret(JSON.stringify({ password, ...(signingKey ? { signingKey } : {}) } satisfies WordPressSecret)),
    scopes: null,
    plugin,
    status: 'ok',
    error: null,
    connectedAt: now,
    connectedBy: state.by,
    checkedAt: now,
  };
  await saveConnection(c);
  // Plugin 1.1.0+ gets its signing key now (no-op when it already has one).
  if (pluginSupportsSigning(c.plugin?.version) && !signingKey) await wordpressSession(c, { save: saveConnection }).catch(() => undefined);
  return done('connected', 'wordpress');
}
