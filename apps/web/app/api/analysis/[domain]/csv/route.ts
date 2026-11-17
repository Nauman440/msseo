import { analysisToCsv, normDomain } from '@seo/core';
import { getAnalysis } from '@/lib/analysis';
import { competitorAccess } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

/** GET /api/analysis/[domain]/csv?list=keywords|content — Module 6 gap lists for the team or the site's customer. */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const a = await getAnalysis(domain);
  if (!a) return new Response('No analysis yet', { status: 404 });
  const list = new URL(req.url).searchParams.get('list') === 'content' ? 'content' : 'keywords';
  return new Response(analysisToCsv(a, list), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${list === 'content' ? 'content-gap' : 'keyword-gap'}-${domain}.csv"`, 'cache-control': 'no-store' },
  });
}
