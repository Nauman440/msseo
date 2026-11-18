import { briefToMarkdown, normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { loadPageMap } from '@/lib/mapping';

export const dynamic = 'force-dynamic';

/** GET /api/mapping/[domain]/brief?topic= — the brief for a new page, as Markdown for a writer. */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const topic = new URL(req.url).searchParams.get('topic') ?? '';
  const r = topic ? await loadPageMap(domain, topic) : null;
  if (!r?.brief) return new Response('Not found', { status: 404 });
  const slug = r.row.clusterId.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'page';
  return new Response(briefToMarkdown(r.brief, domain), {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="brief-${slug}.md"`, 'cache-control': 'no-store' },
  });
}
