import { canViewAudit, notFound } from '@/lib/access';
import { internalOrigin, renderPdf } from '@/lib/pdf';
import { getReport, parseMode } from '@/lib/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/audits/[id]/pdf?mode=client|expert — server-rendered PDF download. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!(await canViewAudit(id))) return notFound();
  const report = await getReport(id);
  if (!report) return new Response('Report not found', { status: 404 });
  const mode = parseMode(new URL(req.url).searchParams.get('mode') ?? undefined, report.audience);

  // Forward the caller's credentials (login cookie, or the old shared password) so the
  // headless browser passes the same gate as the person who clicked "Download PDF".
  const headers: Record<string, string> = {};
  for (const name of ['cookie', 'authorization']) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }

  try {
    const pdf = await renderPdf(`${internalOrigin()}/audits/${encodeURIComponent(id)}/print?mode=${mode}`, headers);
    const name = `seo-audit-${report.project.domain.replace(/[^a-z0-9.-]/gi, '')}-${report.crawledAt.slice(0, 10)}-${mode}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Could not create the PDF: ${msg.slice(0, 300)}`, { status: 500 });
  }
}
