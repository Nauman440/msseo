import { CATEGORY_LABEL, SEVERITY_WEIGHT } from '../scoring/constants';
import { categoryScores, icePriority, overallScore, scoreAfterFixes, scoreLabel, type ScoredRule } from '../scoring';
import type { Audience, Category, TemplateSpeed, CheckCard, CheckChart, CheckRow, CwvMetric, ReportIssue, ReportModel, ReportPage, RuleMeta, Segment, TopIssue } from '../types';
import { assetRules } from './rules-assets';
import { contentRules } from './rules-content';
import { linkRules } from './rules-links';
import { onpageRules } from './rules-onpage';
import { siteRules } from './rules-site';
import { CWV, rate, speedRules } from './rules-speed';
import { technicalRules } from './rules-technical';
import { aiRules } from './rules-ai';
import { indexFunnel, gscRules } from './rules-gsc';
import { correctedSitemapUrls } from '../report/sitemap';
import { templateRules } from './rules-templates';
import { trustRules } from './rules-trust';
import { urlRules } from './rules-urls';
import { pathOf, type AuditContext, type AuditData, type CardId, type EvaluatedRule, type RuleDef } from './types';

export const ALL_RULES: RuleDef[] = [...technicalRules, ...urlRules, ...linkRules, ...siteRules, ...speedRules, ...assetRules, ...onpageRules, ...contentRules, ...trustRules, ...templateRules, ...gscRules, ...aiRules];

const CATEGORY_ORDER: Category[] = ['technical', 'onpage', 'speed', 'mobile', 'ai', 'trust', 'security'];

const CARDS: { id: CardId; title: string; section: CheckCard['section']; expertOnly?: boolean }[] = [
  { id: 'indexing', title: 'Indexing', section: 'technical' },
  { id: 'errors', title: 'Error pages', section: 'technical' },
  { id: 'canonical', title: 'Canonical tags', section: 'technical' },
  { id: 'domains', title: 'Domain and security', section: 'technical' },
  { id: 'depth', title: 'Click depth and internal links', section: 'technical' },
  { id: 'schema', title: 'Structured data', section: 'technical' },
  { id: 'speed', title: 'Page speed', section: 'technical' },
  { id: 'mobile', title: 'Mobile', section: 'technical' },
  { id: 'links', title: 'Links and anchor text', section: 'technical' },
  { id: 'stack', title: 'Security and tech stack', section: 'technical' },
  { id: 'intl', title: 'International', section: 'technical' },
  { id: 'urls', title: 'URL structure', section: 'technical', expertOnly: true },
  { id: 'titles', title: 'Title tags', section: 'onpage' },
  { id: 'meta', title: 'Meta descriptions', section: 'onpage' },
  { id: 'headings', title: 'Headings', section: 'onpage' },
  { id: 'content', title: 'Content', section: 'onpage' },
  { id: 'images', title: 'Images and video', section: 'onpage' },
  { id: 'trust', title: 'Trust signals', section: 'onpage' },
  { id: 'aeo', title: 'AI search readiness', section: 'onpage' },
  { id: 'gsc-index', title: 'Index coverage in Google', section: 'gsc' },
  { id: 'gsc-perf', title: 'Search performance', section: 'gsc' },
];

const toMeta = (d: RuleDef): RuleMeta => ({
  id: d.id, module: d.module, category: d.category, title: d.title, method: d.method ?? 'auto', scope: d.scope, explain: d.explain, fix: d.fix, ice: d.ice,
});

/** Same page, ignoring scheme, "www." and a trailing slash. */
const samePage = (a: string, b: string) => {
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return norm(a) === norm(b);
};

function contextOf(data: AuditData): AuditContext {
  const html = data.pages.filter((p) => p.resource_type === 'html');
  const content = (data.content ?? []).filter((c) => c.status === 200);
  return { data, html, ok: html.filter((p) => p.status_code === 200), content, home: content.find((c) => samePage(c.url, data.preflight.homepage.finalUrl)) };
}

export function evaluateRules(data: AuditData): EvaluatedRule[] {
  const ctx = contextOf(data);
  const out: EvaluatedRule[] = [];
  for (const def of ALL_RULES) {
    // Quick audits have no link graph: never let a crawl-only rule read as "pass".
    if (def.crawlOnly && data.mode === 'quick') continue;
    const ev = def.evaluate(ctx);
    if (!ev) continue;
    out.push({
      def,
      sub: ev.sub,
      result: {
        ruleId: def.id,
        status: ev.status,
        severity: ev.severity ?? def.severity,
        affectedCount: ev.affected?.length,
        applicableCount: ev.applicable,
        examples: (ev.affected ?? []).map((url) => ({ url })),
        metrics: ev.metrics,
        message: ev.message,
      },
    });
  }
  return out;
}

const isIssue = (r: EvaluatedRule) => r.result.status === 'fail' || r.result.status === 'warn';

function toRow(r: EvaluatedRule): CheckRow {
  const first = r.result.examples[0]?.url;
  return {
    ruleId: r.def.id,
    ...(r.def.method && r.def.method !== 'auto' ? { method: r.def.method } : {}),
    status: r.result.status,
    severity: r.result.severity,
    message: r.result.message,
    url: first ? pathOf(first) : undefined,
    affectedCount: r.result.affectedCount,
    // The extra line (e.g. the AI's advice, or "based on N inspected URLs") shows under the row.
    ...(r.sub ? { sub: r.sub } : {}),
  };
}

const sameUrl = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

function chartFor(card: CardId, ctx: AuditContext): CheckChart | undefined {
  const { ok } = ctx;
  const count = (f: (p: (typeof ok)[number]) => boolean) => ok.filter(f).length;
  switch (card) {
    case 'errors': {
      const all = ctx.data.pages;
      const by = (lo: number, hi: number) => all.filter((p) => p.status_code >= lo && p.status_code < hi).length;
      return { kind: 'hbar', rows: [
        { label: '2xx', value: by(200, 300), tone: 'pass' },
        { label: '3xx', value: by(300, 400), tone: 'primary' },
        { label: '4xx', value: by(400, 500), tone: 'fail' },
        { label: '5xx', value: by(500, 600), tone: 'fail' },
      ] };
    }
    case 'canonical': {
      const missing = count((p) => !p.meta?.canonical);
      const self = count((p) => !!p.meta?.canonical && sameUrl(p.meta.canonical, p.url));
      return { kind: 'stacked', segments: [
        { label: 'Self-canonical', value: self, tone: 'pass' },
        { label: 'Missing', value: missing, tone: 'warn' },
        { label: 'Points elsewhere', value: ok.length - self - missing, tone: 'high' },
      ] };
    }
    case 'depth': {
      const d = (p: (typeof ok)[number]) => p.click_depth ?? 0;
      return { kind: 'hbar', rows: [
        { label: '0–1 click', value: count((p) => d(p) <= 1), tone: 'pass' },
        { label: '2 clicks', value: count((p) => d(p) === 2), tone: 'pass' },
        { label: '3 clicks', value: count((p) => d(p) === 3), tone: 'warn' },
        { label: '4+ clicks', value: count((p) => d(p) >= 4), tone: 'fail' },
      ] };
    }
    case 'titles': {
      const len = (p: (typeof ok)[number]) => p.meta?.title_length ?? p.meta?.title?.length ?? 0;
      return { kind: 'stacked', segments: [
        { label: '50–60 chars', value: count((p) => !!p.meta?.title && len(p) >= 50 && len(p) <= 60), tone: 'pass' },
        { label: 'Too short', value: count((p) => !!p.meta?.title && len(p) < 50), tone: 'warn' },
        { label: 'Too long', value: count((p) => len(p) > 60), tone: 'high' },
        { label: 'Missing', value: count((p) => !p.meta?.title), tone: 'fail' },
      ] };
    }
    case 'meta': {
      const len = (p: (typeof ok)[number]) => p.meta?.description_length ?? p.meta?.description?.length ?? 0;
      return { kind: 'stacked', segments: [
        { label: '140–160 chars', value: count((p) => !!p.meta?.description && len(p) >= 140 && len(p) <= 160), tone: 'pass' },
        { label: 'Wrong length', value: count((p) => !!p.meta?.description && (len(p) < 140 || len(p) > 160)), tone: 'warn' },
        { label: 'Missing', value: count((p) => !p.meta?.description), tone: 'fail' },
      ] };
    }
    case 'images':
      return { kind: 'stacked', segments: [
        { label: 'Pages with alt text', value: count((p) => p.checks?.no_image_alt !== true), tone: 'pass' },
        { label: 'Pages missing alt', value: count((p) => p.checks?.no_image_alt === true), tone: 'fail' },
      ] };
    case 'gsc-index': {
      if (!ctx.data.gsc || !ctx.content.length) return undefined;
      const f = indexFunnel(ctx);
      return { kind: 'hbar', rows: [
        { label: 'Crawled', value: f.crawled, tone: 'info' },
        { label: 'Indexable', value: f.indexable, tone: 'primary' },
        { label: 'In sitemap', value: f.inSitemap, tone: 'primary' },
        { label: 'Indexed', value: f.indexed.length, tone: 'pass' },
      ] };
    }
    case 'gsc-perf': {
      const q = (ctx.data.gsc?.queries ?? []).filter((r) => r.position <= 30 && r.impressions >= 10).sort((a, b) => b.impressions - a.impressions).slice(0, 80);
      if (!q.length) return undefined;
      return { kind: 'scatter', xLabel: 'Average position', yLabel: 'Impressions', band: [4, 20], points: q.map((r) => ({ x: Math.round(r.position * 10) / 10, y: r.impressions, label: r.keys[0] ?? '' })) };
    }
    default:
      return undefined;
  }
}

function suggestedRobots(data: AuditData): string {
  const lines = ['User-agent: *'];
  const keep = data.preflight.robots.disallowAll.filter((d) => d !== '/' && d !== '/*');
  lines.push(...(keep.length ? keep.map((d) => `Disallow: ${d}`) : ['Disallow:']));
  const sitemap = data.preflight.sitemaps.find((s) => s.valid && (s.isIndex || data.preflight.sitemaps.length === 1))?.url
    ?? data.preflight.sitemaps.find((s) => s.valid)?.url;
  if (sitemap) lines.push('', `Sitemap: ${sitemap}`);
  return lines.join('\n');
}

function cwvFrom(data: AuditData): ReportModel['cwv'] {
  const psi = data.psi;
  if (!psi) return null;
  const src = psi.field ?? psi.lab;
  const metrics: CwvMetric[] = [];
  const push = (id: CwvMetric['id'], label: string, value: number | undefined, fmt: (v: number) => string, t: { good: number; poor: number }, threshold: string) => {
    const r = rate(value, t);
    if (value !== undefined && r) metrics.push({ id, label, value: fmt(value), threshold, rating: r });
  };
  push('lcp', 'Largest Contentful Paint', src.lcpMs, (v) => `${(v / 1000).toFixed(1)} s`, CWV.lcpMs, 'Good ≤ 2.5 s');
  if (psi.field) push('inp', 'Interaction to Next Paint', psi.field.inpMs, (v) => `${Math.round(v)} ms`, CWV.inpMs, 'Good ≤ 200 ms');
  push('cls', 'Cumulative Layout Shift', src.cls, (v) => v.toFixed(2), CWV.cls, 'Good ≤ 0.1');
  if (!psi.field || metrics.length < 3) push('ttfb', 'Server response time', src.ttfbMs, (v) => `${Math.round(v)} ms`, CWV.ttfbMs, 'Good ≤ 0.8 s');
  return metrics.length ? { source: psi.field ? 'field' : 'lab', device: 'mobile', metrics: metrics.slice(0, 3) } : null;
}

/** Module 5 page inventory: the audited pages with what keyword mapping needs. */
function reportPages(data: AuditData): ReportPage[] | undefined {
  if (!data.content?.length) return undefined;
  const typeOf = new Map((data.templates ?? []).flatMap((t) => t.urls.map((u) => [u, t.type] as const)));
  return data.content
    .filter((c) => c.status < 400)
    .slice(0, 100)
    .map((c) => ({
      url: c.url,
      title: c.title ?? null,
      h1: c.h1[0] ?? null,
      words: c.words,
      pageType: typeOf.get(c.url) ?? null,
      schemaTypes: c.schemaTypes,
      links: [...new Set(c.links.filter((l) => l.internal).map((l) => l.href.split('#')[0]!))].slice(0, 150),
    }));
}

function speedByTemplate(data: AuditData): TemplateSpeed[] | undefined {
  const runs = data.lighthouse ?? [];
  if (!runs.length) return undefined;
  return runs.map((r) => {
    const lab = (r.mobile ?? r.desktop)?.lab;
    return { label: r.label, url: r.url, pages: r.pages, mobile: r.mobile?.performance ?? null, desktop: r.desktop?.performance ?? null, lcpMs: lab?.lcpMs, tbtMs: lab?.tbtMs, cls: lab?.cls };
  });
}

export function buildReport(data: AuditData, opts: { auditId: string; audience: Audience; brand: string }): ReportModel {
  const html = data.pages.filter((p) => p.resource_type === 'html');
  const ctx = contextOf(data);
  const evaluated = evaluateRules(data);
  const scored: ScoredRule[] = evaluated.map((r) => ({ meta: toMeta(r.def), result: r.result }));

  const cats = categoryScores(scored);
  const overall = overallScore(cats);
  const issues = evaluated.filter(isIssue);

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of issues) if (r.result.severity !== 'info') severityCounts[r.result.severity]++;

  // Page health (§6.4): errors = non-200 or a failing page rule; warnings = warn-only.
  const failUrls = new Set(issues.filter((r) => r.def.scope === 'page' && r.result.status === 'fail').flatMap((r) => r.result.examples.map((e) => e.url)));
  const warnUrls = new Set(issues.filter((r) => r.def.scope === 'page' && r.result.status === 'warn').flatMap((r) => r.result.examples.map((e) => e.url)));
  const errors = html.filter((p) => p.status_code !== 200 || failUrls.has(p.url)).length;
  const warnings = ctx.ok.filter((p) => !failUrls.has(p.url) && warnUrls.has(p.url)).length;

  const ranked = issues.slice().sort((a, b) => {
    const sw = (r: EvaluatedRule) => (r.result.severity === 'info' ? 0 : SEVERITY_WEIGHT[r.result.severity]);
    return sw(b) - sw(a) || icePriority(b.def.ice) - icePriority(a.def.ice);
  });
  const topIssues: TopIssue[] = ranked.map((r) => ({
    ruleId: r.def.id, severity: r.result.severity, category: r.def.category, ice: r.def.ice, title: r.result.message, sub: r.sub ?? r.def.explain,
  }));
  const reportIssues: ReportIssue[] = ranked.map((r) => ({
    ruleId: r.def.id,
    category: r.def.category,
    severity: r.result.severity,
    status: r.result.status,
    title: r.def.title,
    message: r.result.message,
    explain: r.def.explain,
    fix: r.def.fix,
    affectedCount: r.result.affectedCount,
    applicableCount: r.result.applicableCount,
    urls: r.result.examples.slice(0, 500).map((e) => e.url),
    ice: r.def.ice,
  }));

  const byCard = (id: CardId) => evaluated.filter((r) => r.def.card === id);
  const cards: CheckCard[] = CARDS.map((c) => ({ ...c, chart: chartFor(c.id, ctx), rows: byCard(c.id).map(toRow) })).filter((c) => c.rows.length);

  const checks = data.preflight.sitemapUrlChecks;
  const segments: Segment[] = checks.length
    ? [
        { label: 'Valid (200)', value: checks.filter((c) => c.status === 200).length, tone: 'pass' },
        { label: 'Redirect', value: checks.filter((c) => c.status >= 300 && c.status < 400).length, tone: 'warn' },
        { label: 'Broken / error', value: checks.filter((c) => c.status === 0 || c.status >= 400).length, tone: 'fail' },
      ]
    : [];

  const host = new URL(data.preflight.origin).hostname.replace(/^www\./, '');
  return {
    auditId: opts.auditId,
    brand: opts.brand,
    project: { name: host, domain: host },
    url: data.url,
    audience: opts.audience,
    pagesCrawled: html.length,
    crawlLimit: data.pageLimit,
    auditMode: data.mode,
    crawledAt: data.crawledAt,
    gscProperty: data.gsc?.property ?? null,
    overall: { score: overall, label: scoreLabel(overall), afterFixes: Math.max(overall, scoreAfterFixes(scored)) },
    categories: CATEGORY_ORDER.filter((c) => cats[c] !== undefined).map((c) => ({ id: c, label: CATEGORY_LABEL[c], score: cats[c]! })),
    severityCounts,
    pageHealth: { healthy: Math.max(0, ctx.ok.length - warnings - ctx.ok.filter((p) => failUrls.has(p.url)).length), warnings, errors },
    cwv: cwvFrom(data),
    speedByTemplate: speedByTemplate(data),
    pages: reportPages(data),
    topIssues,
    robots: { found: data.preflight.robots.found, rows: byCard('robots').map(toRow), suggested: suggestedRobots(data) },
    sitemap: {
      found: data.preflight.sitemaps.some((s) => s.valid),
      url: data.preflight.sitemaps.find((s) => s.valid)?.url ?? '',
      rows: byCard('sitemap').map(toRow),
      segments,
      corrected: correctedSitemapUrls(data) ?? undefined,
    },
    cards,
    issues: reportIssues,
    notices: data.notices?.length ? data.notices : undefined,
  };
}
