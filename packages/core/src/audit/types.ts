import type { OnPagePage, OnPageSummary } from '../providers/dataforseo';
import type { Preflight } from '../providers/direct-fetch';
import type { PageSpeedResult } from '../providers/pagespeed';
import type { AudienceText, Category, Ice, RuleResult, RuleStatus, Severity } from '../types';

/** Everything the rules need, collected by the pipeline (a slice of §5.4 SiteData). */
export type AuditData = {
  url: string;
  pageLimit: number;
  jsRendering: boolean;
  crawledAt: string;
  preflight: Preflight;
  summary: OnPageSummary | null;
  pages: OnPagePage[];
  psi: PageSpeedResult | null;
  /** Caveats collected while running (copied onto the report). */
  notices?: AudienceText[];
};

/** Derived views shared by many rules. */
export type AuditContext = {
  data: AuditData;
  /** HTML pages returned by the crawl (any status). */
  html: OnPagePage[];
  /** HTML pages that answered 200 — the denominator for most on-page rules. */
  ok: OnPagePage[];
};

export type CardId =
  | 'indexing'
  | 'robots'
  | 'sitemap'
  | 'errors'
  | 'canonical'
  | 'domains'
  | 'depth'
  | 'schema'
  | 'speed'
  | 'urls'
  | 'titles'
  | 'meta'
  | 'headings'
  | 'content'
  | 'images';

export type Evaluation = {
  status: RuleStatus;
  severity?: Severity;
  affected?: string[];
  applicable?: number;
  message: AudienceText;
  /** Plain-language "why it matters" shown under top issues. */
  sub?: AudienceText;
  metrics?: Record<string, number | string>;
};

export type RuleDef = {
  id: string;
  module: 1 | 2;
  category: Category;
  card: CardId;
  scope: 'site' | 'page';
  severity: Severity;
  title: AudienceText;
  explain: AudienceText;
  fix: AudienceText;
  ice: Ice;
  /** Returns null when the rule does not apply (e.g. no PageSpeed key). */
  evaluate: (ctx: AuditContext) => Evaluation | null;
};

export type EvaluatedRule = { def: RuleDef; result: RuleResult; sub?: AudienceText };

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Path of a URL for compact display. */
export const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search || '/';
  } catch {
    return url;
  }
};

/**
 * Standard page-scope rule: counts pages matching `test`. Pass when none match,
 * otherwise `status` (default fail). Returns null (rule not applicable) when there
 * are no pages to check — an empty crawl must never read as "all clear".
 */
export function countPages(
  pages: OnPagePage[],
  test: (p: OnPagePage) => boolean,
  message: (n: number, total: number) => AudienceText,
  status: Extract<RuleStatus, 'warn' | 'fail'> = 'fail',
): Evaluation | null {
  if (pages.length === 0) return null;
  const affected = pages.filter(test).map((p) => p.url);
  return {
    status: affected.length === 0 ? 'pass' : status,
    affected,
    applicable: pages.length,
    message: message(affected.length, pages.length),
  };
}
