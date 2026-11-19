import { BRIEF_TEMPLATE, normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';

export const dynamic = 'force-dynamic';

/** GET /api/content/[domain]/brief — 7.9 the blank content brief template as Markdown. */
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  return new Response(BRIEF_TEMPLATE, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="content-brief-template.md"', 'cache-control': 'no-store' },
  });
}
