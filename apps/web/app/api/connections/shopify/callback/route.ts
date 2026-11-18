import { NextResponse, type NextRequest } from 'next/server';
import type { SiteConnection } from '@seo/core';
import { createShopifyClient, encryptSecret, exchangeShopifyCode, SHOP_RE, SHOPIFY_SCOPES, verifyShopifyHmac } from '@seo/core/server';
import { sameSite, saveConnection, shopifyApp } from '@/lib/connections';
import { clearState, readState, withMessage } from '@/lib/connect-flow';
import { publicOrigin } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/connections/shopify/callback — checks the HMAC, state and shop name (shopify.dev), swaps
 * the code for an expiring offline token, checks the scopes and that the store's main domain is the
 * audited website, then saves the tokens encrypted.
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req.headers);
  const p = req.nextUrl.searchParams;
  const app = shopifyApp();
  const state = readState(req, p.get('state'));
  if (!state || !app) return NextResponse.redirect(new URL('/', origin));
  const done = (key: 'error' | 'connected', value: string) => clearState(withMessage(origin, state.back, key, value));
  const shop = p.get('shop') ?? '';
  const code = p.get('code') ?? '';
  if (!verifyShopifyHmac(p, app.clientSecret) || !SHOP_RE.test(shop) || shop !== state.target || !code) return done('error', 'Shopify’s answer could not be verified. Please try again.');

  try {
    const { secret, scope } = await exchangeShopifyCode(app, shop, code);
    const granted = new Set(scope.split(',').map((s) => s.trim()));
    // Shopify grants read_x with write_x, so only the write scopes are checked.
    const missing = SHOPIFY_SCOPES.filter((s) => s.startsWith('write_') && !granted.has(s));
    if (missing.length) return done('error', `The store did not grant everything needed (${missing.join(', ')}).`);
    const info = await createShopifyClient({ shop, token: async () => secret.accessToken }).shop();
    if (!sameSite(info.primaryHost, state.domain)) return done('error', `This store’s main domain is ${info.primaryHost}, not ${state.domain}.`);
    const now = new Date().toISOString();
    const c: SiteConnection = {
      domain: state.domain,
      platform: 'shopify',
      siteUrl: `https://${shop}`,
      account: shop,
      secret: encryptSecret(JSON.stringify(secret)),
      scopes: scope,
      plugin: null,
      status: 'ok',
      error: null,
      connectedAt: now,
      connectedBy: state.by,
      checkedAt: now,
    };
    await saveConnection(c);
    return done('connected', 'shopify');
  } catch {
    return done('error', 'Shopify did not finish the connection. Please try again.');
  }
}
