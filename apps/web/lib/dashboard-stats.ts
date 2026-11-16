import type { AuditRecord } from './store-file';

export type DashboardStat = { value: string; label: string; hint: string };

const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

/** Real team numbers for the dashboard, computed from stored audits (either store). */
export function dashboardStats(records: AuditRecord[], now = new Date()): DashboardStat[] {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thirtyDays = now.getTime() - 30 * 86_400_000;
  const completed = records.filter((r) => r.status === 'completed' && r.report);
  const thisMonth = records.filter((r) => Date.parse(r.createdAt) >= monthStart);
  const recent = completed.filter((r) => Date.parse(r.createdAt) >= thirtyDays);
  const avg = recent.length ? Math.round(recent.reduce((s, r) => s + r.report!.overall.score, 0) / recent.length) : null;

  // Open critical issues: from each project's latest completed audit.
  const latestByDomain = new Map<string, AuditRecord>();
  for (const r of completed) {
    const d = domainOf(r.input.url);
    const prev = latestByDomain.get(d);
    if (!prev || r.createdAt > prev.createdAt) latestByDomain.set(d, r);
  }
  const critical = [...latestByDomain.values()].reduce((s, r) => s + (r.report!.severityCounts.critical ?? 0), 0);
  const pages = thisMonth.reduce((s, r) => s + (r.report?.pagesCrawled ?? 0), 0);
  const projects = new Set(records.map((r) => domainOf(r.input.url))).size;

  return [
    { value: String(thisMonth.length), label: 'Audits this month', hint: `${records.length} in total` },
    { value: avg === null ? '–' : String(avg), label: 'Average health score', hint: recent.length ? `Last 30 days, ${recent.length} ${recent.length === 1 ? 'audit' : 'audits'}` : 'No audits in 30 days' },
    { value: String(critical), label: 'Critical issues open', hint: `Latest audit of ${latestByDomain.size} ${latestByDomain.size === 1 ? 'project' : 'projects'}` },
    { value: String(pages), label: 'Pages audited', hint: `This month, ${projects} ${projects === 1 ? 'project' : 'projects'} overall` },
  ];
}
