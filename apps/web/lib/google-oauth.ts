import 'server-only';
import type { GoogleOAuth } from '@seo/core';

/**
 * Google OAuth settings for the Search Console connection. The redirect URI is
 * GOOGLE_REDIRECT_URI when set, otherwise <public origin>/api/gsc/callback, read from
 * the proxy headers so staging and production each use their own domain. It must be
 * listed in the Google Cloud OAuth client.
 */
export function googleOAuth(headers: Headers): GoogleOAuth {
  const fixed = process.env.GOOGLE_REDIRECT_URI?.trim();
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3005';
  const proto = headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    redirectUri: fixed || `${proto.split(',')[0]}://${host.split(',')[0]}/api/gsc/callback`,
  };
}

export const GSC_STATE_COOKIE = 'gsc_oauth_state';
