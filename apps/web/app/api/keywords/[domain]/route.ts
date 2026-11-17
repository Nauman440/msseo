import { normDomain, queryKeywords, type KeywordSort } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { getKeywordWorkspace } from '@/lib/keywords';

export const dynamic = 'force-dynamic';

const SORTS: KeywordSort[] = ['term', 'volume', 'difficulty', 'cpc', 'position'];
const SHOWS = ['kept', 'removed', 'all'] as const;

/** GET /api/keywords/[domain]?q=&show=&intent=&sort=&desc=&offset= — one page of the keyword table. */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return Response.json({ error: 'Bad domain' }, { status: 400 });
  if (!(await competitorAccess(domain))) return Response.json({ error: 'Not found' }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const sort = sp.get('sort') as KeywordSort | null;
  const show = sp.get('show') as (typeof SHOWS)[number] | null;
  const result = queryKeywords(await getKeywordWorkspace(domain), {
    q: sp.get('q') ?? undefined,
    show: show && SHOWS.includes(show) ? show : 'kept',
    intent: sp.get('intent') || undefined,
    sort: sort && SORTS.includes(sort) ? sort : 'volume',
    desc: sp.get('desc') !== '0',
    offset: Number(sp.get('offset')) || 0,
  });
  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
