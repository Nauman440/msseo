import NextAuth from 'next-auth';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { verifyPrintToken } from '@seo/core/print-token';
import { authConfig } from './auth.config';

/*
 * Access control. The public landing page and its assets are always open. Everything
 * else (dashboard, audits, PDFs, APIs) needs a signed-in team member once AUTH_SECRET
 * is set. Before that, the old shared PREVIEW_PASSWORD still guards the tool, so a
 * deploy never opens or locks out the site while AUTH_SECRET is being added.
 * /setup (create the first admin) is always behind PREVIEW_PASSWORD.
 */
const PUBLIC_PATHS = new Set(['/', '/api/me', '/privacy', '/terms', '/free', '/signup', '/login', '/forgot-password', '/reset-password', '/robots.txt', '/sitemap.xml', '/llms.txt', '/manifest.webmanifest', '/sw.js', '/offline.html', '/icon.png', '/api/autopilot/tick']);
// /free/<id> and its status API show only audits started from the public form (checked there).
// /signup/* pages check the customer session themselves (step 1 is open, steps 2–5 need it).
const PUBLIC_PREFIXES = ['/brand/', '/downloads/', '/opengraph-image', '/twitter-image', '/api/auth/', '/free/', '/api/free/', '/signup/'];

const { auth } = NextAuth(authConfig);

// Session check: pages redirect to /login (keeping the destination), APIs get 401.
const sessionGate = auth((req) => {
  if (req.auth?.user) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const login = new URL('/login', req.nextUrl);
  login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
});

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  // One host only: www.msseo.tech → msseo.tech (our own rule 1.6.3 flagged the duplicate).
  const host = req.headers.get('host') ?? '';
  if (host.startsWith('www.')) {
    const url = req.nextUrl.clone();
    url.host = host.slice(4);
    url.port = '';
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // The worker's headless browser renders a report PDF to email: a signed, 10-minute token
  // for that one audit's print page stands in for a login (see @seo/core/print-token).
  const print = /^\/audits\/([^/]+)\/print$/.exec(pathname);
  const token = req.nextUrl.searchParams.get('pdf_token');
  if (print && token && process.env.ENCRYPTION_KEY) {
    if (await verifyPrintToken(token, decodeURIComponent(print[1]!), process.env.ENCRYPTION_KEY).catch(() => false)) return NextResponse.next();
    return new NextResponse('Link expired', { status: 401 });
  }

  const preview = process.env.PREVIEW_PASSWORD;
  if (pathname === '/setup') return preview ? basicAuth(req, preview) : new NextResponse('Not found', { status: 404 });

  if (process.env.AUTH_SECRET) return sessionGate(req, event as never);
  if (preview) return basicAuth(req, preview);
  // Fail closed on servers: the Docker image sets REQUIRE_AUTH=1.
  if (process.env.REQUIRE_AUTH === '1' || process.env.REQUIRE_PREVIEW_PASSWORD === '1') {
    return new NextResponse('Not configured: set AUTH_SECRET in the server environment and redeploy.', { status: 503 });
  }
  return NextResponse.next(); // local development
}

function basicAuth(req: NextRequest, password: string) {
  const [scheme, encoded] = (req.headers.get('authorization') ?? '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    if (safeEqual(decoded.slice(decoded.indexOf(':') + 1), password)) return NextResponse.next();
  }
  return new NextResponse('Password required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="MSScore team"' } });
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  // api/health stays public for the container health check.
  matcher: ['/((?!_next/static|_next/image|icons/|favicon.ico|api/health$).*)'],
};
