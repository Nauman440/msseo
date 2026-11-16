import type { OnPagePage, OnPageSummary } from '../providers/dataforseo';
import type { Preflight } from '../providers/direct-fetch';
import type { PageSpeedResult } from '../providers/pagespeed';
import type { PageContent } from './page-content';
import type { UrlVariantProbe } from './url-probes';
import type { LinkCheck } from './link-check';
import type { LighthouseRun } from './lighthouse';
import type { Template } from './templates';
import type { GscData } from './gsc-collect';
import type { AudienceText, Category, Ice, RuleResult, RuleStatus, Severity } from '../types';

export type AuditMode = 'quick' | 'deep';

/** Everything the rules need, collected by the pipeline (a slice of §5.4 SiteData). */
export type AuditData = {
  url: string;
  pageLimit: number;
  jsRendering: boolean;
  /** quick = live per-page checks (Instant Pages); deep = full DataForSEO crawl. */
  mode: AuditMode;
  crawledAt: string;
  preflight: Preflight;
  summary: OnPageSummary | null;
  pages: OnPagePage[];
  /** Parsed HTML of the audited pages (read by us; see page-content.ts). */
  content?: PageContent[];
  /** Trailing-slash / uppercase variants of a few pages (rule 1.6.4). */
  probes?: UrlVariantProbe[];
  /** Status of links found on the audited pages (rules 1.5.7, 1.12.5, 2.6.4). */
  links?: LinkCheck[];
  /** Page templates (spec §7) and the Lighthouse runs on their representatives. */
  templates?: Template[];
  lighthouse?: LighthouseRun[];
  /** Search Console data; undefined when no property was selected (all GSC rules are then skipped). */
  gsc?: GscData;
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
  /** Parsed HTML of pages that answered 200 (may be fewer than `ok` if a fetch failed). */
  content: PageContent[];
  /** The homepage's parsed HTML, when it could be read. */
  home?: PageContent;
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
  | 'images'
  | 'mobile'
  | 'links'
  | 'stack'
  | 'intl'
  | 'trust'
  | 'aeo'
  | 'gsc-index'
  | 'gsc-perf';

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
  /** Needs the full crawl's link graph (depth, inlinks, cross-page comparison); skipped in quick mode. */
  crawlOnly?: true;
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
export function countPages<T extends { url: string }>(
  pages: T[],
  test: (p: T) => boolean,
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
