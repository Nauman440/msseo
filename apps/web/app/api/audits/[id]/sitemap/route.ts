import { canViewAudit, notFound } from '@/lib/access';
import { sitemapXml } from '@seo/core';
import { getReport } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/** GET /api/audits/[id]/sitemap — the corrected sitemap.xml built from the audit (spec Phase 2). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!(await canViewAudit(id))) return notFound();
  const report = await getReport(id);
  const corrected = report?.sitemap.corrected;
  if (!report || !corrected?.urls.length) return new Response('No corrected sitemap for this audit', { status: 404 });
  return new Response(sitemapXml(corrected.urls), {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': 'attachment; filename="sitemap.xml"', 'cache-control': 'no-store' },
  });
}
