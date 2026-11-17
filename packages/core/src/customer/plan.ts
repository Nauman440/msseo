import type { GscRow } from '../providers/gsc';
import type { ReportModel } from '../types';

/**
 * "This week's plan" on the customer dashboard: the searches closest to page 1 (Search
 * Console positions 4–20), the page that ranks for each, and what to do on it, read from
 * the latest audit's findings for that page.
 */
export type PlanAction = 'Title' | 'Answer' | 'Links' | 'Section' | 'Description' | 'New page';
export type PlanRow = { query: string; position: number; impressions: number; clicks: number; page: string | null; actions: PlanAction[] };

const ACTION_RULES: [PlanAction, RegExp][] = [
  ['Title', /^2\.1\./],
  ['Description', /^2\.2\./],
  ['Answer', /^2\.8\.1/],
  ['Links', /^(2\.6\.[13]|1\.12\.7)/],
  ['Section', /^(2\.4\.(1|4|9)|2\.3\.4)/],
];

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

/** Aggregates page+query rows into one entry per search (impression-weighted position, best page). */
export function searchesFrom(rows: GscRow[]): { query: string; position: number; impressions: number; clicks: number; page: string | null }[] {
  const by = new Map<string, { query: string; impressions: number; clicks: number; posSum: number; page: string | null; pageImpr: number }>();
  for (const r of rows) {
    const [query, page] = r.keys;
    if (!query) continue;
    const e = by.get(query) ?? { query, impressions: 0, clicks: 0, posSum: 0, page: null, pageImpr: -1 };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    e.posSum += r.position * r.impressions;
    if (page && r.impressions > e.pageImpr) [e.page, e.pageImpr] = [page, r.impressions];
    by.set(query, e);
  }
  return [...by.values()].map((e) => ({ query: e.query, impressions: e.impressions, clicks: e.clicks, page: e.page, position: e.impressions ? Math.round((e.posSum / e.impressions) * 10) / 10 : 0 }));
}

export function weeklyPlan(rows: GscRow[], report?: ReportModel | null, size = 5): PlanRow[] {
  const issues = report?.issues ?? [];
  return searchesFrom(rows)
    .filter((s) => s.position >= 4 && s.position <= 20 && s.impressions >= 10)
    // The most searched candidates, then the ones nearest the top first.
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25)
    .sort((a, b) => a.position - b.position || b.impressions - a.impressions)
    .slice(0, size)
    .map((s) => {
      if (!s.page) return { ...s, actions: ['New page'] as PlanAction[] };
      const page = norm(s.page);
      const found = ACTION_RULES.filter(([, re]) => issues.some((i) => re.test(i.ruleId) && i.urls.some((u) => norm(u) === page))).map(([a]) => a);
      // No finding for that page: on page 1 a better title earns more clicks; on page 2 the content needs to grow.
      const actions: PlanAction[] = found.length ? found.slice(0, 2) : s.position <= 10 ? ['Title'] : ['Section'];
      return { ...s, actions };
    });
}

/** Site totals from a query-less Search Analytics row. */
export function gscTotals(rows: GscRow[]): { clicks: number; impressions: number; position: number | null } {
  const r = rows[0];
  return r ? { clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 } : { clicks: 0, impressions: 0, position: null };
}
