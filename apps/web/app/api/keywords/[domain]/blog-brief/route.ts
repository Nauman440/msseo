import { blogBrief, blogIdeaFor, blogIdeas, briefToMarkdown, normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { getKeywordWorkspace } from '@/lib/keywords';
import { getMapping, mappingContext } from '@/lib/mapping';

export const dynamic = 'force-dynamic';

/** GET /api/keywords/[domain]/blog-brief?id= — the writer's brief for one blog idea, as Markdown. */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const [kw, mapping, ctx] = await Promise.all([getKeywordWorkspace(domain), getMapping(domain), mappingContext(domain)]);
  const idea = blogIdeaFor(blogIdeas(kw, mapping), id);
  if (!idea) return new Response('Not found', { status: 404 });
  const slug = idea.clusterId.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'article';
  return new Response(briefToMarkdown(blogBrief(idea, ctx.brand), domain), {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="blog-brief-${slug}.md"`, 'cache-control': 'no-store' },
  });
}
