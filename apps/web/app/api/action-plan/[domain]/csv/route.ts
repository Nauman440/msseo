import { actionsToCsv, normDomain } from '@seo/core';
import { getActions } from '@/lib/actions';
import { competitorAccess } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

/** GET /api/action-plan/[domain]/csv — the action plan for the team or the site's customer. */
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  return new Response(actionsToCsv(await getActions(domain)), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="action-plan-${domain}.csv"`, 'cache-control': 'no-store' },
  });
}
