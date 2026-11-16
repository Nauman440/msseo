import { reportToMarkdown } from '@seo/core';
import { getReport, parseMode } from '@/lib/reports';
import { appSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** GET /api/audits/[id]/markdown?mode=client|expert — report as a .md download. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const report = await getReport((await params).id);
  if (!report) return new Response('Report not found', { status: 404 });
  const mode = parseMode(new URL(req.url).searchParams.get('mode') ?? undefined, report.audience);
  const name = `seo-audit-${report.project.domain.replace(/[^a-z0-9.-]/gi, '')}-${report.crawledAt.slice(0, 10)}-${mode}.md`;
  const clientUrls = (await appSettings())['report.maxExampleUrlsClient'];
  return new Response(reportToMarkdown(report, mode, { clientUrls }), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
