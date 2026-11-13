import { NextResponse, type NextRequest } from 'next/server';

/*
 * Temporary password gate for sharing a test build (e.g. through a Cloudflare Tunnel)
 * before Auth.js login exists. Off unless PREVIEW_PASSWORD is set.
 */
export function middleware(req: NextRequest) {
  const password = process.env.PREVIEW_PASSWORD;
  if (!password) {
    // Fail closed on servers: the Docker image sets REQUIRE_PREVIEW_PASSWORD=1, so a
    // deploy that forgot the password shows this instead of opening the app.
    if (process.env.REQUIRE_PREVIEW_PASSWORD === '1') {
      return new NextResponse('Not configured: set PREVIEW_PASSWORD in the server environment and redeploy.', { status: 503 });
    }
    return NextResponse.next();
  }

  const header = req.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const supplied = decoded.slice(decoded.indexOf(':') + 1);
    if (safeEqual(supplied, password)) return NextResponse.next();
  }
  return new NextResponse('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Morosoft SEO audit (test)"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  // api/health stays public for the container health check; it returns only { ok: true }.
  matcher: ['/((?!_next/static|_next/image|icons/|favicon.ico|api/health$).*)'],
};
