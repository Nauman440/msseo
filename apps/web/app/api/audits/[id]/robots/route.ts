import { getReport } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/** GET /api/audits/[id]/robots — the suggested robots.txt from the audit, as a download (spec Phase 2). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const report = await getReport((await params).id);
  if (!report?.robots.suggested) return new Response('Report not found', { status: 404 });
  return new Response(report.robots.suggested.endsWith('\n') ? report.robots.suggested : `${report.robots.suggested}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="robots.txt"', 'cache-control': 'no-store' },
  });
}
