import { NextResponse, type NextRequest } from 'next/server';
import { WP_APP_ID, WP_APP_NAME, wordpressAuthorizeUrl } from '@seo/core';
import { connectionsReady, sameSite } from '@/lib/connections';
import { redirectWithState, startGuard, withMessage } from '@/lib/connect-flow';
import { siteKey, siteLabel, siteUrl } from '@seo/core';

export const dynamic = 'force-dynamic';

/**
 * GET /api/connections/wordpress/start?domain=&site=&back= — sends the person to their WordPress
 * "Authorize application" screen (Application Passwords, WordPress 5.6+). WordPress sends them back
 * to our callback with the site address, user name and a new application password.
 */
export async function GET(req: NextRequest) {
  const { domain, viewer, origin, back } = await startGuard(req);
  if (!viewer) return NextResponse.redirect(new URL('/login', origin));
  if (!connectionsReady()) return withMessage(origin, back, 'error', 'Connecting websites is not set up on this server yet (ENCRYPTION_KEY).');
  const raw = (req.nextUrl.searchParams.get('site') || siteUrl(domain)).trim();
  let site: URL;
  try {
    site = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  } catch {
    return withMessage(origin, back, 'error', 'Type your WordPress address, like https://yourdomain.com');
  }
  if (!sameSite(site.toString(), domain)) return withMessage(origin, back, 'error', `Connect the WordPress site at ${siteLabel(domain)}, not ${siteLabel(siteKey(site.toString().replace(/\/*$/, '/')))}.`);
  if (!origin.startsWith('https://')) return withMessage(origin, back, 'error', 'WordPress only sends approvals back to https addresses. Use the live MS SCORE site.');
  const root = `https://${site.host}${site.pathname.replace(/\/+$/, '')}`;
  const auth = await wordpressAuthorizeUrl(root);
  if ('error' in auth) return withMessage(origin, back, 'error', auth.error);

  return redirectWithState(req, { domain, back, target: root, by: viewer.kind === 'customer' ? 'customer' : 'team' }, (nonce) => {
    const url = new URL(auth.url);
    url.searchParams.set('app_name', WP_APP_NAME);
    url.searchParams.set('app_id', WP_APP_ID);
    url.searchParams.set('success_url', `${origin}/api/connections/wordpress/callback?state=${nonce}`);
    url.searchParams.set('reject_url', `${origin}/api/connections/wordpress/callback?state=${nonce}&rejected=1`);
    return url.toString();
  });
}
