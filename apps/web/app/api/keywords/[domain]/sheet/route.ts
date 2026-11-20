import { keywordResearchSheets, normDomain, toXlsx } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { getKeywordWorkspace } from '@/lib/keywords';
import { getMapping } from '@/lib/mapping';

export const dynamic = 'force-dynamic';

/**
 * GET /api/keywords/[domain]/sheet — the final keyword research sheet (.xlsx): summary, topics, keywords
 * with their role and page, page plan, blog ideas, competing pages and removed keywords.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const [kw, mapping] = await Promise.all([getKeywordWorkspace(domain), getMapping(domain)]);
  const file = toXlsx(keywordResearchSheets(kw, mapping));
  return new Response(new Blob([file as Uint8Array<ArrayBuffer>]), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="keyword-research-${domain}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
