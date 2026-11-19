import { altDraftsToCsv, normDomain } from '@seo/core';
import { getAltText } from '@/lib/alt-text';
import { competitorAccess } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

/** GET /api/content/[domain]/alt-text — the alt-text drafts as CSV (page, image, alt text). */
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const doc = await getAltText(domain);
  return new Response(altDraftsToCsv(doc?.drafts ?? []), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="alt-text-${domain}.csv"`, 'cache-control': 'no-store' },
  });
}
