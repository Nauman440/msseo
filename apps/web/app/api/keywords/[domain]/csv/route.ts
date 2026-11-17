import { keywordsToCsv, normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { getKeywordWorkspace } from '@/lib/keywords';

export const dynamic = 'force-dynamic';

/** GET /api/keywords/[domain]/csv — the whole keyword list (kept and removed) for the team or the site's customer. */
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const ws = await getKeywordWorkspace(domain);
  return new Response(keywordsToCsv(ws), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="keywords-${domain}.csv"`, 'cache-control': 'no-store' },
  });
}
