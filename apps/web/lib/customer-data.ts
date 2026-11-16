import 'server-only';
import type { ReportModel } from '@seo/core';
import { domainOf, type Account } from './accounts';
import { isAuditActive } from './audit-runner';
import { listAudits, usingDatabase } from './audit-store';

export type CustomerAuditRow = { id: string; createdAt: string; status: 'running' | 'completed' | 'failed'; score: number | null; pages: number };

/**
 * A customer's audits: every audit of their website's domain (their free audit, the
 * weekly re-audits and the ones they run), newest first, plus the two latest reports.
 */
export async function customerAudits(account: Account): Promise<{ rows: CustomerAuditRow[]; latest?: ReportModel; previous?: ReportModel }> {
  if (!account.website) return { rows: [] };
  const domain = domainOf(account.website);

  if (usingDatabase()) {
    const { getProjectHistory, projectIdFor } = await import('@seo/db');
    const history = await getProjectHistory(await projectIdFor(account.website));
    if (!history) return { rows: [] };
    const rows = [...history.audits].reverse().map((a) => ({
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      status: a.status === 'completed' || a.status === 'failed' ? a.status : ('running' as const),
      score: a.overallScore,
      pages: a.pagesCrawled ?? 0,
    }));
    return { rows, latest: history.latest, previous: history.previous };
  }

  const records = (await listAudits(1000)).filter((r) => domainOf(r.input.url) === domain);
  const rows = records.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    status: r.status === 'running' && !isAuditActive(r.id) ? ('failed' as const) : r.status,
    score: r.report?.overall.score ?? null,
    pages: r.report?.pagesCrawled ?? 0,
  }));
  const done = records.filter((r) => r.status === 'completed' && r.report);
  return { rows, latest: done[0]?.report, previous: done[1]?.report };
}
