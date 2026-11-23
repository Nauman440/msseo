import { normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { internalOrigin, renderPdf } from '@/lib/pdf';
import { reportDocument, reportFileName, reportQuery } from '@/lib/report-docs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/reports/[domain]/pdf?kind=week&date= | kind=month&month= | kind=plan — a weekly report, a whole
 * month or the six-month action plan as a PDF, for the team or the site's customer.
 */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return new Response('Bad domain', { status: 400 });
  if (!(await competitorAccess(domain))) return new Response('Not found', { status: 404 });
  const q = new URL(req.url).searchParams;
  const doc = reportDocument({ kind: q.get('kind') ?? undefined, date: q.get('date') ?? undefined, month: q.get('month') ?? undefined });
  if (!doc) return new Response('Unknown report', { status: 400 });

  // The headless browser passes the same login as the person who clicked "Download PDF".
  const headers: Record<string, string> = {};
  for (const name of ['cookie', 'authorization']) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  try {
    const pdf = await renderPdf(`${internalOrigin()}/print/reports/${encodeURIComponent(domain)}?${reportQuery(doc)}`, headers);
    return new Response(new Uint8Array(pdf), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${reportFileName(domain, doc)}"`, 'cache-control': 'no-store' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Could not create the PDF: ${msg.slice(0, 300)}`, { status: 500 });
  }
}
