import { NextResponse } from 'next/server';
import { isTeamRole } from '@/lib/users';
import { authEnabled, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me — who is signed in, for the prerendered landing page's top bar: { kind: guest | team |
 * customer }. Always 200 (public). Without login switched on (local development) everyone is a guest.
 */
export async function GET() {
  const user = authEnabled() ? await getSessionUser().catch(() => null) : null;
  const kind = !user?.id ? 'guest' : user.role === 'customer' ? 'customer' : isTeamRole(user.role) ? 'team' : 'guest';
  return NextResponse.json({ kind }, { headers: { 'cache-control': 'private, no-store' } });
}
