import { NextResponse, type NextRequest } from 'next/server';
import { normShop, shopifyAuthorizeUrl } from '@seo/core/server';
import { connectionsReady, shopifyApp } from '@/lib/connections';
import { redirectWithState, startGuard, withMessage } from '@/lib/connect-flow';

export const dynamic = 'force-dynamic';

/** GET /api/connections/shopify/start?domain=&shop=&back= — Shopify's install and approval screen (OAuth). */
export async function GET(req: NextRequest) {
  const { domain, viewer, origin, back } = await startGuard(req);
  if (!viewer) return NextResponse.redirect(new URL('/login', origin));
  const app = shopifyApp();
  if (!connectionsReady() || !app) return withMessage(origin, back, 'error', 'Connecting Shopify is not set up on this server yet.');
  const shop = normShop(req.nextUrl.searchParams.get('shop') ?? '');
  if (!shop) return withMessage(origin, back, 'error', 'Type your store’s Shopify address, like your-store.myshopify.com');
  return redirectWithState(req, { domain, back, target: shop, by: viewer.kind === 'customer' ? 'customer' : 'team' }, (nonce) =>
    shopifyAuthorizeUrl(app, shop, `${origin}/api/connections/shopify/callback`, nonce),
  );
}
