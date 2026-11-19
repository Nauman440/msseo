import { backlinksToCsv, normDomain } from '@seo/core';
import { getBacklinks } from '@/lib/backlinks';
import { competitorAccess } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

const LISTS = ['domains', 'gap', 'broken', 'outreach'] as const;

/** GET /api/backlinks/[domain]/csv?list=domains|gap|broken|outreach — for the team or the site's customer. */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const raw = new URL(req.url).searchParams.get('list');
  const list = LISTS.find((l) => l === raw) ?? 'domains';
  return new Response(backlinksToCsv(await getBacklinks(domain), list), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="backlinks-${list}-${domain}.csv"`, 'cache-control': 'no-store' },
  });
}
