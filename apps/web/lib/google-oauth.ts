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
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    redirectUri: fixed || `${publicOrigin(headers)}/api/gsc/callback`,
  };
}

/** The address visitors use (behind Coolify's proxy the request URL is the container's). */
export function publicOrigin(headers: Headers): string {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3005').split(',')[0]!.trim();
  const proto = (headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0]!.trim();
  return `${proto}://${host}`;
}

export const GSC_STATE_COOKIE = 'gsc_oauth_state';
/** "customer:<domain>" while a customer connects their own Google account (absent for the team's connection). */
export const GOOGLE_FLOW_COOKIE = 'google_oauth_flow';
