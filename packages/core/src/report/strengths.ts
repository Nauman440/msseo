import type { AudienceText, CheckRow, ReportModel, Severity } from '../types';

/**
 * "What's working well" and "Pages audited" for the report and PDF, built from what every saved report
 * already holds (passed checks on the cards; the page list and each issue's affected addresses), so
 * older reports show them too.
 */
export type Strength = { ruleId: string; severity: Severity; message: AudienceText };
const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Passed checks that matter (critical, high, medium), most important first, one per rule. */
export function reportStrengths(report: ReportModel, max = 8): Strength[] {
  const rows: CheckRow[] = [...(report.robots?.rows ?? []), ...(report.sitemap?.rows ?? []), ...report.cards.flatMap((c) => c.rows)];
  const seen = new Set<string>();
  return rows
    .filter((r) => r.status === 'pass' && r.method !== 'manual' && ['critical', 'high', 'medium'].includes(r.severity))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
    .filter((r) => (seen.has(r.ruleId) ? false : (seen.add(r.ruleId), true)))
    .slice(0, max)
    .map((r) => ({ ruleId: r.ruleId, severity: r.severity, message: r.message }));
}

export type AuditedPage = {
  url: string;
  path: string;
  type: string;
  words: number;
  /** Issues whose affected addresses include this page (failed or warned checks). */
  issues: number;
  /** The most important of them, in client and expert words. */
  topIssue: AudienceText | null;
};

const TYPE_LABEL: Record<string, string> = {
  home: 'Homepage', service: 'Service page', location: 'Location page', service_location: 'Service + place page', blog_post: 'Article', blog_index: 'Blog index',
  category: 'Category / tag page', contact: 'Contact page', about: 'About page', legal: 'Policy page', other: 'Other page',
};
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname || '/';
  } catch {
    return u;
  }
};

/** Every audited page with its type, words and how many issues touch it (empty for reports without a page list). */
export function auditedPages(report: ReportModel): AuditedPage[] {
  const issues = (report.issues ?? []).filter((i) => i.status === 'fail' || i.status === 'warn');
  const total = report.pages?.length ?? 0;
  return (report.pages ?? []).map((p) => {
    const key = norm(p.url);
    const hits = issues.filter((i) => i.urls.some((u) => norm(u) === key));
    // The page's own problem says more than one shared by (nearly) every page: among the important issues
    // (critical, high, medium), the one touching the fewest pages; ties keep the report's order.
    const spread = (i: (typeof hits)[number]) => new Set(i.urls.map(norm)).size;
    const important = hits.filter((i) => i.severity !== 'low' && i.severity !== 'info' && spread(i) < total);
    const own = important.reduce<(typeof hits)[number] | undefined>((best, i) => (!best || spread(i) < spread(best) ? i : best), undefined) ?? hits[0];
    return {
      url: p.url,
      path: pathOf(p.url),
      type: TYPE_LABEL[p.pageType ?? ''] ?? (p.pageType ? p.pageType : 'Page'),
      words: p.words,
      issues: hits.length,
      topIssue: own?.title ?? null,
    };
  });
}
