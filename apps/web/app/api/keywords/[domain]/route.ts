import { KEYWORD_ROLES, LOW_VOLUME, normDomain, queryKeywords, type KeywordFrom, type KeywordRole, type KeywordSort } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { getKeywordWorkspace } from '@/lib/keywords';

export const dynamic = 'force-dynamic';

const SORTS: KeywordSort[] = ['term', 'volume', 'difficulty', 'cpc', 'position'];
const SHOWS = ['kept', 'removed', 'all'] as const;
const FROMS: KeywordFrom[] = ['gap', 'pages', 'ranked', 'gsc', 'ideas'];

/** GET /api/keywords/[domain]?q=&show=&intent=&sort=&desc=&offset= — one page of the keyword table. */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return Response.json({ error: 'Bad domain' }, { status: 400 });
  if (!(await competitorAccess(domain))) return Response.json({ error: 'Not found' }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const sort = sp.get('sort') as KeywordSort | null;
  const show = sp.get('show') as (typeof SHOWS)[number] | null;
  const from = sp.get('from') as KeywordFrom | null;
  const role = sp.get('role') as KeywordRole | null;
  const result = queryKeywords(await getKeywordWorkspace(domain), {
    q: sp.get('q') ?? undefined,
    show: show && SHOWS.includes(show) ? show : 'kept',
    intent: sp.get('intent') || undefined,
    role: role && KEYWORD_ROLES.includes(role) ? role : undefined,
    topic: sp.get('topic') || undefined,
    from: from && FROMS.includes(from) ? from : undefined,
    sort: sort && SORTS.includes(sort) ? sort : 'volume',
    desc: sp.get('desc') !== '0',
    offset: Number(sp.get('offset')) || 0,
    // Searches fewer than 10 people make a month are hidden unless "show them" is ticked (low=1).
    minVolume: sp.get('low') === '1' ? undefined : LOW_VOLUME,
  });
  return Response.json(result, { headers: { 'cache-control': 'no-store' } });
}
