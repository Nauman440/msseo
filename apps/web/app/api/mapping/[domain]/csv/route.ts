import { mappingToCsv, normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { getMapping } from '@/lib/mapping';

export const dynamic = 'force-dynamic';

/** GET /api/mapping/[domain]/csv — the page plan for the team or the site's customer. */
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  return new Response(mappingToCsv(await getMapping(domain)), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="page-plan-${domain}.csv"`, 'cache-control': 'no-store' },
  });
}
