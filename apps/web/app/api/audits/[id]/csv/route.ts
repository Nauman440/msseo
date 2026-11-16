import { canViewAudit, notFound } from '@/lib/access';
import { issuesToCsv } from '@seo/core';
import { getReport } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/** GET /api/audits/[id]/csv?rule=1.5.1 — affected URLs of one issue (or all issues without `rule`) as CSV (Expert, spec §8). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!(await canViewAudit(id))) return notFound();
  const report = await getReport(id);
  if (!report) return new Response('Report not found', { status: 404 });
  const rule = new URL(req.url).searchParams.get('rule') ?? undefined;
  if (rule && !/^[\w.-]{1,20}$/.test(rule)) return new Response('Bad rule id', { status: 400 });
  const csv = issuesToCsv(report, rule);
  if (csv === null) return new Response('Issue not found in this report', { status: 404 });
  const domain = report.project.domain.replace(/[^a-z0-9.-]/gi, '');
  const name = `seo-audit-${domain}-${report.crawledAt.slice(0, 10)}-${rule ? `issue-${rule}` : 'issues'}.csv`;
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
  });
}
