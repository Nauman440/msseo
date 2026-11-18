import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { normDomain } from '@seo/core';
import { competitorAccess } from './competitors';
import { publicOrigin } from './google-oauth';

/**
 * Shared steps of the WordPress and Shopify connect flows: who may connect a site, where to send
 * the person back, and a short-lived state cookie that ties the callback to this browser.
 */
export const CONNECT_COOKIE = 'site_connect_state';
export type ConnectState = { nonce: string; domain: string; back: string; target: string; by: string };

/** Only same-app paths ("/my/connections?site=x"), never another host. */
export const safeBack = (v: string | null, fallback: string) => (v && /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : fallback);

export async function startGuard(req: NextRequest) {
  const domain = normDomain(req.nextUrl.searchParams.get('domain') ?? '');
  const viewer = domain ? await competitorAccess(domain) : null;
  const origin = publicOrigin(req.headers);
  const back = safeBack(req.nextUrl.searchParams.get('back'), viewer?.kind === 'customer' ? `/my/connections?site=${encodeURIComponent(domain)}` : `/action-plan/${domain}`);
  return { domain, viewer, origin, back };
}

export function withMessage(origin: string, back: string, key: 'error' | 'connected', value: string) {
  const u = new URL(back, origin);
  u.searchParams.set(key, value);
  return NextResponse.redirect(u);
}

/** Redirects to `location` with a fresh state cookie; `location` receives the nonce. */
export function redirectWithState(req: NextRequest, s: Omit<ConnectState, 'nonce'>, location: (nonce: string) => string) {
  const nonce = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(location(nonce));
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  const value = Buffer.from(JSON.stringify({ ...s, nonce })).toString('base64url');
  // Lax so the cookie comes back on the platform's top-level redirect; 10 minutes to approve.
  res.cookies.set(CONNECT_COOKIE, value, { httpOnly: true, secure, sameSite: 'lax', path: '/api/connections', maxAge: 600 });
  return res;
}

export function readState(req: NextRequest, nonce: string | null): ConnectState | null {
  const raw = req.cookies.get(CONNECT_COOKIE)?.value;
  if (!raw || !nonce) return null;
  try {
    const s = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as ConnectState;
    const a = Buffer.from(s.nonce);
    const b = Buffer.from(nonce);
    return a.length === b.length && timingSafeEqual(a, b) ? s : null;
  } catch {
    return null;
  }
}

export const clearState = (res: NextResponse) => {
  res.cookies.set(CONNECT_COOKIE, '', { path: '/api/connections', maxAge: 0 });
  return res;
};
