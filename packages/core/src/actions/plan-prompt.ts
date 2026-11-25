import { z } from 'zod';
import type { KeywordWorkspace } from '../keywords/types';
import type { MappingWorkspace } from '../mapping/mapping';
import { OpenAiCutOffError, type OpenAiClient } from '../providers/openai';
import type { ReportModel, ReportPage } from '../types';
import type { AiPlan, AiPlanTask, PlanBusiness, PlanExtras, TaskCategory, TaskDoer } from './ai-plan';
import { missingSchema, PAGE_GROUPS, type CleanupItem, type CleanupPage } from './cleanup';

/**
 * Module 12 · the 6-month plan in ONE call (2026-11-24, the user's prompt, tested by them in Claude chat).
 * The prompt is sent word for word; its blocks (<business>, <audit_issues>, <site_check>, <keywords>,
 * <ai_visibility>, <offpage>) are filled in here from what the tool knows about the site. Short answers
 * (every text field under 25 words) keep it to one model call of a few minutes.
 */

export const PLAN_PROMPT_INTRO =
  'You are a senior SEO and AEO (answer engine optimisation) strategist. Create a 6-month action plan for the website below, using the previous audit, a fresh check of the live site, keyword data and an AI-visibility check. The plan is carried out by software and an SEO team, never a developer.';

export const PLAN_PROMPT_RULES = `RULES
1. Exactly 6 months. Each month has AT LEAST 12 tasks (more is fine).
2. Every issue_id and every site_check problem appears in a task. Critical and High go in Months 1–2.
3. NO developer tasks. Allowed doers: auto, approve, team, client. If an issue can only be fixed with theme or code changes, find a no-code route (content, app embed, platform settings, client action in the CMS editor); if none exists, list it in "needs_developer" and leave it out of the plan.
4. Month 1 MUST include separate tasks for: meta titles, meta descriptions, canonical tags, image alt text, heading structure (H1/H2), and schema (Organization, WebSite, BreadcrumbList), covering all affected pages in batches by page type. Titles fit together with the CMS suffix (no brand repeat). Crawl/index blockers, broken links, redirects, sitemap and tracking go in weeks 1–2.
5. AEO in every month (at least 2 tasks per month marked "aeo"), covering over the 6 months: an AI-visibility baseline in Month 1 and a re-test every month; a 40–60 word direct answer at the top of every money page; question-style H2s and FAQs with FAQPage markup; comparison tables on category pages; a factual brand block (who, what, where, delivery, contact) on About; Organization schema with sameAs links, and consistent brand profiles across the web; a complete product feed (Merchant Center) for ecommerce; video transcripts; "last updated" and "reviewed by" dates on articles, with named expert reviewers for health, money or legal topics; original facts or resources that others cite; getting listed on the sites AI tools cite (from <ai_visibility>).
6. Each month also includes technical or on-page, content, and at least 2 off-page tasks not in first month.
7. Order after Month 1: Month 2 striking-distance pages, low CTR, internal links, product schema, cannibalisation; Month 3 speed (no-code), thin pages, blog and first articles; Months 4–5 new pages, clusters and product copy; Month 6 refresh, seasonal prep, re-audit, results. Seasonal work goes live 6–8 weeks before the season.
8. Split large fixes into specific batches to reach 12 if needed, but no filler: every task links to an issue_id, a site_check finding, a keyword or an ai_visibility gap.
9. Dependencies only on earlier tasks. Stay within capacity. Never use banned words.
10. Plain English for a business owner. Keep each text field under 25 words.`;

/**
 * Added 2026-11-25 (user request): a new title and description for every page in Month 1, written out in
 * full so they can be approved and applied page by page. The pages are listed in <pages>.
 */
export const PLAN_PROMPT_PAGE_META = `11. Month 1 page titles and meta descriptions: in "page_meta", write a NEW meta title and a NEW meta description for EVERY page listed in <pages>, one row per page. Title: 50–60 characters including the CMS title suffix, main keyword near the start, no brand repeat, unique across the site. Description: 140–155 characters, unique, with the main keyword, a benefit and a call to action. Write "keep" only when the current one already meets these rules. The Month 1 meta title and meta description tasks apply these rows.`;

/** How the answer is laid out (the JSON schema enforces the fields; this says what goes in them). */
const PLAN_PROMPT_OUTPUT = `OUTPUT
Answer in the JSON schema. Task id "<month>.<nn>" (e.g. "1.01"), week 1–4. doer: auto = software applies it with no approval (alt text, schema); approve = software applies it after the client says yes (titles, metas, H1s, canonicals, redirects); team = the SEO team; client = the business owner. category "aeo" for AI-visibility work. site_wide_item marks the Month 1 batches of rule 4 (meta_title, meta_description, canonical, alt_text, h1, schema), else "none"; page_group = the batch's page type, else "none". issue_ids = the issue_ids and site_check ids (SC-…) the task fixes. page_meta: one row per page in <pages> (url exactly as listed). urls: up to 5 examples. impact, confidence, effort 1–5. check_after_days 7, 14 or 28. summary: 3–4 sentences. baseline_and_targets: 4–6 rows. later: work that does not fit the capacity, with the reason. data_gaps: data that was missing.`;

// ---- Issues: the audit plus the fresh site check --------------------------------------------

export type PlanSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
/** One line of <audit_issues> or one site_check problem (id "SC-nn"). */
export type PlanIssue = {
  issue_id: string;
  issue: string;
  severity: PlanSeverity;
  affected_url_count: number;
  example_urls: string[];
  fix: string;
  /** The Month 1 batch that fixes it, when it is one of rule 4's items. */
  item?: CleanupItem;
};
export type NeedsDeveloper = { issue_id: string; issue: string; reason: string };

const SEV: Record<string, PlanSeverity> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
/** Audit rules whose fix is one of rule 4's Month 1 batches. */
const RULE_ITEM: [RegExp, CleanupItem][] = [
  [/^2\.1\.[123](-|$)/, 'meta_title'], [/^2\.2\.[12](-|$)/, 'meta_description'], [/^2\.3\.[13](-|$)/, 'h1'],
  [/^1\.6\.[12](-|$)/, 'canonical'], [/^2\.5\.2(-|$)/, 'alt_text'], [/^1\.11\.1(-|$)/, 'schema'],
];
export const itemOfRule = (ruleId: string): CleanupItem | undefined => RULE_ITEM.find(([re]) => re.test(ruleId))?.[1];

export const normPlanUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\s+/g, ' ').replace(/\|/g, '/');

/** The site check: totals from the crawl, as findings with ids "SC-nn" (only problems that exist). */
export function siteCheck(report: ReportModel | null, pages: CleanupPage[]): { lines: string[]; issues: PlanIssue[] } {
  const lines: string[] = [];
  const issues: PlanIssue[] = [];
  const raw = report?.pages ?? [];
  const add = (issue: string, severity: PlanSeverity, urls: string[], fix: string, item?: CleanupItem) => {
    const id = `SC-${String(issues.length + 1).padStart(2, '0')}`;
    issues.push({ issue_id: id, issue, severity, affected_url_count: urls.length, example_urls: urls.slice(0, 5), fix, ...(item ? { item } : {}) });
    lines.push(`${id} | ${issue} | ${severity} | ${urls.length} | ${urls.slice(0, 5).join(' ')}`);
  };
  if (!report) return { lines: ['not checked yet: no audit'], issues };

  const robotsProblems = report.robots.rows.filter((r) => r.status === 'fail' || r.status === 'warn').map((r) => r.message.expert);
  lines.push(`robots.txt: ${report.robots.found ? 'found' : 'NOT FOUND'}${robotsProblems.length ? `; ${robotsProblems.map((m) => short(m, 90)).join('; ')}` : ''}`);
  if (!report.robots.found) add('robots.txt missing', 'High', [], 'Add a robots.txt that allows crawling and lists the sitemap.');
  const listed = report.sitemap.segments.reduce((n, s) => n + s.value, 0);
  const indexable = pages.filter((p) => p.indexable).length;
  const sitemapProblems = report.sitemap.rows.filter((r) => r.status === 'fail' || r.status === 'warn').map((r) => r.message.expert);
  lines.push(`Sitemap: ${report.sitemap.found ? `${report.sitemap.url}, ${listed} URLs listed vs ${indexable} indexable pages crawled (of ${report.pagesCrawled} checked)` : 'NOT FOUND'}${sitemapProblems.length ? `; ${sitemapProblems.map((m) => short(m, 90)).join('; ')}` : ''}`);
  if (!report.sitemap.found) add('No XML sitemap found', 'High', [], 'Create the sitemap in the platform settings and submit it in Search Console.');

  const idx = pages.filter((p) => p.indexable);
  const byLower = (vals: [string, string | null | undefined][]) => {
    const m = new Map<string, string[]>();
    for (const [url, v] of vals) if (v?.trim()) m.set(v.trim().toLowerCase(), [...(m.get(v.trim().toLowerCase()) ?? []), url]);
    return [...m.values()].filter((u) => u.length > 1).flat();
  };
  const rawOf = new Map(raw.map((p) => [normPlanUrl(p.url), p]));
  const r = (p: CleanupPage): ReportPage | undefined => rawOf.get(normPlanUrl(p.url));
  const known = idx.filter((p) => p.h1_count !== null);
  const urls = (f: (p: CleanupPage) => boolean) => known.filter(f).map((p) => p.url);

  const noTitle = urls((p) => !p.title_length);
  const dupTitle = byLower(known.map((p) => [p.url, r(p)?.title]));
  const longTitle = urls((p) => (p.title_length ?? 0) > 60);
  const noMeta = urls((p) => !p.description_length);
  const dupMeta = byLower(known.map((p) => [p.url, r(p)?.description]));
  const longMeta = urls((p) => (p.description_length ?? 0) > 160);
  const noH1 = urls((p) => p.h1_count === 0);
  const manyH1 = urls((p) => (p.h1_count ?? 0) > 1);
  const noCanonical = urls((p) => p.canonical === 'missing');
  const variants = pages.filter((p) => p.variant_url && p.canonical !== 'other').map((p) => p.url);
  const altPages = pages.filter((p) => (p.images_without_alt ?? 0) > 0);
  const altCount = altPages.reduce((n, p) => n + (p.images_without_alt ?? 0), 0);
  lines.push(`Titles: ${noTitle.length} missing, ${dupTitle.length} duplicate, ${longTitle.length} over 60 characters (of ${known.length} indexable pages)`);
  lines.push(`Meta descriptions: ${noMeta.length} missing, ${dupMeta.length} duplicate, ${longMeta.length} over 160 characters`);
  lines.push(`H1: ${noH1.length} pages with none, ${manyH1.length} with 2 or more`);
  lines.push(`Canonicals: ${noCanonical.length} missing; ${variants.length} variant/filter/pagination URLs not pointing to the clean URL`);
  lines.push(`Images missing alt: ${altCount} on ${altPages.length} pages`);
  if (noTitle.length) add('Pages without a title', 'High', noTitle, 'Write a unique title for each page.', 'meta_title');
  if (dupTitle.length) add('Duplicate titles', 'Medium', dupTitle, 'Give each page its own title.', 'meta_title');
  if (longTitle.length) add('Titles over 60 characters', 'Low', longTitle, 'Shorten to 50–60 characters, suffix included.', 'meta_title');
  if (noMeta.length) add('Pages without a meta description', 'Medium', noMeta, 'Write a unique description of 140–155 characters.', 'meta_description');
  if (dupMeta.length) add('Duplicate meta descriptions', 'Medium', dupMeta, 'Give each page its own description.', 'meta_description');
  if (longMeta.length) add('Meta descriptions over 160 characters', 'Low', longMeta, 'Shorten to 140–155 characters.', 'meta_description');
  if (noH1.length) add('Pages without an H1', 'Medium', noH1, 'Give each page one H1 with its main keyword.', 'h1');
  if (manyH1.length) add('Pages with 2 or more H1s', 'Low', manyH1, 'Keep one H1; turn the others into H2s.', 'h1');
  if (noCanonical.length) add('Pages without a canonical tag', 'Medium', noCanonical, 'Add a self-referencing canonical.', 'canonical');
  if (variants.length) add('Variant and filter URLs without a canonical to the clean URL', 'High', variants, 'Point them to the clean URL.', 'canonical');
  if (altPages.length) add('Images without alt text', 'Low', altPages.map((p) => p.url), 'Describe each content image in a few words.', 'alt_text');

  const types = new Map<string, number>();
  for (const p of raw) for (const t of new Set(p.schemaTypes)) types.set(t, (types.get(t) ?? 0) + 1);
  lines.push(`Schema types found: ${types.size ? [...types].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} (${n})`).join(', ') : 'none'}`);
  const home = raw.find((p) => p.pageType === 'home') ?? raw[0];
  const homeMissing = home ? missingSchema(home) : [];
  if (homeMissing.length) add(`Homepage has no ${homeMissing.join(' or ')} schema`, 'Medium', [home!.url], 'Add Organization and WebSite JSON-LD.', 'schema');
  const noCrumbs = raw.filter((p) => p !== home && p.noindex !== true && !p.schemaTypes.includes('BreadcrumbList')).map((p) => p.url);
  if (noCrumbs.length) add('Pages without BreadcrumbList schema', 'Low', noCrumbs, 'Add BreadcrumbList JSON-LD to every page below the homepage.', 'schema');
  lines.push(`Blog posts: ${raw.filter((p) => p.pageType === 'blog_post').length}`);

  // Homepage and the top 5 money pages (by links from other checked pages).
  const inlinks = new Map<string, number>();
  for (const p of raw) for (const l of new Set(p.links.map(normPlanUrl))) if (l !== normPlanUrl(p.url)) inlinks.set(l, (inlinks.get(l) ?? 0) + 1);
  const money = pages.filter((p) => p.group === 'money_pages' && p.indexable && (!home || normPlanUrl(p.url) !== normPlanUrl(home.url)))
    .sort((a, b) => (inlinks.get(normPlanUrl(b.url)) ?? 0) - (inlinks.get(normPlanUrl(a.url)) ?? 0)).slice(0, 5).map((p) => rawOf.get(normPlanUrl(p.url))).filter((p): p is ReportPage => Boolean(p));
  lines.push('Homepage and top money pages: url | title (length) | meta description (length) | H1s | words | schema | inlinks');
  for (const p of [home, ...money].filter((x): x is ReportPage => Boolean(x))) {
    lines.push(`${p.url} | ${short(p.title ?? '(none)', 80)} (${p.title?.length ?? 0}) | ${short(p.description ?? '(none)', 90)} (${p.description?.length ?? 0}) | ${p.h1Count ?? '?'}: ${short(p.h1 || '(none)', 60)} | ${p.words} | ${p.schemaTypes.join(', ') || 'none'} | ${inlinks.get(normPlanUrl(p.url)) ?? 0}`);
  }
  return { lines, issues };
}

/** The audit's failed and warned checks as <audit_issues> (rule id = issue_id). */
export function auditIssues(report: ReportModel | null): PlanIssue[] {
  return (report?.issues ?? [])
    .filter((i) => i.severity !== 'info' && (i.status === 'fail' || i.status === 'warn'))
    .slice(0, 60)
    .map((i) => {
      const item = itemOfRule(i.ruleId);
      return {
        issue_id: i.ruleId, issue: short(i.message.expert || i.title.expert, 120), severity: SEV[i.severity] ?? 'Low',
        affected_url_count: i.affectedCount ?? i.urls.length, example_urls: i.urls.slice(0, 5), fix: short(i.fix.expert, 160), ...(item ? { item } : {}),
      };
    });
}

// ---- The other blocks ------------------------------------------------------------------------

/** The ending most titles share (" | Brand", " – Brand"), which the CMS adds to every title. */
export function titleSuffix(pages: Pick<ReportPage, 'title'>[]): string | null {
  const ends = new Map<string, number>();
  const titles = pages.map((p) => p.title?.trim()).filter((t): t is string => Boolean(t));
  for (const t of titles) {
    const m = /\s([|–—-])\s([^|–—-]{2,40})$/.exec(t);
    if (m) ends.set(` ${m[1]} ${m[2]!.trim()}`, (ends.get(` ${m[1]} ${m[2]!.trim()}`) ?? 0) + 1);
  }
  const best = [...ends].sort((a, b) => b[1] - a[1])[0];
  return best && titles.length >= 3 && best[1] / titles.length >= 0.6 ? best[0] : null;
}

export type PlanPlatform = 'Shopify' | 'WordPress' | 'other';
/** The site connection's platform, else hints in the crawl (Shopify paths, WordPress files). */
export function platformOf(report: ReportModel | null, connected?: 'shopify' | 'wordpress' | null): PlanPlatform {
  if (connected === 'shopify') return 'Shopify';
  if (connected === 'wordpress') return 'WordPress';
  const pages = report?.pages ?? [];
  const text = [report?.sitemap.url ?? '', ...(report?.issues ?? []).filter((i) => i.ruleId === '1.10.5').map((i) => `${i.message.expert} ${i.urls.join(' ')}`)].join(' ');
  if (/shopify/i.test(text) || (pages.some((p) => /\/products\//.test(p.url)) && pages.some((p) => /\/collections\//.test(p.url)))) return 'Shopify';
  if (/wordpress|wp-sitemap|wp-content|\/wp-json/i.test(text)) return 'WordPress';
  return 'other';
}

/** What the tool can change on the site without code, for "What the software can do without code". */
export function softwareCan(platform: PlanPlatform, connected: boolean): string {
  if (connected && platform === 'Shopify') return 'edit SEO titles and meta descriptions, page and product titles (H1), 301 redirects and new pages as drafts through the Shopify connection; alt text, schema through an app embed, page and product content and hiding pages from search are done by the team in the Shopify admin';
  if (connected && platform === 'WordPress') return 'edit SEO titles and meta descriptions (through the SEO plugin), page titles (H1), 301 redirects and new pages as drafts through the MS SCORE Connector plugin; alt text, schema, page content and hiding pages from search are done by the team in the WordPress editor';
  return 'the website is not connected yet: software drafts titles, metas, H1s, alt text, schema (JSON-LD for an app embed or plugin) and redirects, and the team or the client applies them in the CMS editor';
}

const KIND_TEXT = { ecommerce: 'ecommerce', local_service: 'local_service', local_shop: 'local_shop', b2b: 'b2b', mixed: 'b2b (services, no fixed area)' } as const;

export function businessBlock(b: PlanBusiness, extra: { platform: PlanPlatform; suffix: string | null; software: string }): string {
  const c = b.capacity;
  return [
    `Domain: ${b.domain} | Platform: ${extra.platform} | Type: ${KIND_TEXT[b.businessType]}`,
    `Sells: ${b.sells.slice(0, 12).join(', ') || 'no data'}${b.brands.length ? ` (brands: ${b.brands.slice(0, 8).join(', ')})` : ''} | Area: ${b.where || 'no data'} | Priorities: ${b.priorities.slice(0, 3).join(', ') || 'no data'}`,
    `Busy seasons: ${b.seasonalPeaks.join('; ') || 'no data'} | Never claim: ${b.bannedWords?.length ? b.bannedWords.join(', ') : 'none given'}`,
    `Start date: ${b.startDate} | Monthly capacity: ${c.automatic} automatic changes, ${c.newPages} new pages, ${c.articles} articles${c.outreach ? ', outreach done by the SEO team' : ', outreach by the client with templates'}`,
    `CMS title suffix: ${extra.suffix ? `"${extra.suffix}"` : 'none'}`,
    `What the software can do without code: ${extra.software}`,
    ...(b.competitors?.length ? [`Competitors we watch: ${b.competitors.join(', ')}`] : []),
  ].join('\n');
}

export function keywordsBlock(kw: KeywordWorkspace, mapping: MappingWorkspace | null, gsc: PlanExtras['gsc']): string {
  const rows = mapping?.rows ?? [];
  const pageFor = new Map<string, string>();
  for (const r of rows) {
    const target = r.url ?? (r.suggestedPath ? `new page ${r.suggestedPath}` : 'new page');
    for (const k of [r.primaryKeyword, ...r.secondaryKeywords]) if (k) pageFor.set(k.toLowerCase(), target);
  }
  const kept = kw.keywords.filter((k) => k.status === 'kept');
  const top = kept.slice().sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 40);
  const out = ['Top 40: keyword | volume | position | ranking URL | intended page'];
  for (const k of top) out.push(`${k.term} | ${k.volume ?? '?'} | ${k.position ?? '-'} | ${k.url ?? '-'} | ${pageFor.get(k.term.toLowerCase()) ?? '-'}`);
  const striking = kept.filter((k) => k.position !== null && k.position >= 4 && k.position <= 20).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 25);
  out.push('', 'Striking distance (4–20): keyword | position | volume | URL', ...(striking.length ? striking.map((k) => `${k.term} | ${k.position} | ${k.volume ?? '?'} | ${k.url ?? '-'}`) : ['none']));
  const gap = kept.filter((k) => k.gapFrom?.length && k.position === null).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 20);
  out.push('', 'Gap keywords (competitors rank, we do not): keyword | volume | competitor', ...(gap.length ? gap.map((k) => `${k.term} | ${k.volume ?? '?'} | ${k.gapFrom!.slice(0, 2).join(', ')}`) : ['none']));
  const removed = kw.keywords.filter((k) => k.status === 'removed').sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 15);
  out.push('', 'Removed keywords: keyword | reason', ...(removed.length ? removed.map((k) => `${k.term} | ${k.removeReason ?? 'removed'}`) : ['none']));
  if (gsc?.length) {
    const lowCtr = gsc.filter((r) => r.impressions >= 100 && r.position <= 10 && r.clicks / r.impressions < 0.02).sort((a, b) => b.impressions - a.impressions).slice(0, 15);
    out.push('', 'Search Console, low CTR (top 10, under 2%): query | page | impressions | CTR | position',
      ...(lowCtr.length ? lowCtr.map((r) => `${r.query} | ${r.page ?? '-'} | ${r.impressions} | ${Math.round((r.clicks / r.impressions) * 1000) / 10}% | ${Math.round(r.position * 10) / 10}`) : ['none']));
  }
  const competing = rows.filter((r) => r.conflicts.length).slice(0, 10);
  if (competing.length) out.push('', 'Cannibalisation (two pages for one topic): topic | main page | competing pages', ...competing.map((r) => `${r.topic} | ${r.url ?? '-'} | ${r.conflicts.map((c) => c.url).join(', ')}`));
  return out.join('\n');
}

export function aiVisibilityBlock(ai: PlanExtras['aiSearch'], questions: string[]): string {
  if (!ai) return `not checked yet.${questions.length ? ` Buyer questions to test: ${questions.slice(0, 20).join(' / ')}` : ''}`;
  const byQ = new Map<string, { said: string[]; cited: Set<string> }>();
  for (const a of ai.answers ?? []) {
    const q = byQ.get(a.question) ?? { said: [], cited: new Set<string>() };
    q.said.push(`${a.assistant}: ${a.mentioned ? 'yes' : 'no'}`);
    for (const c of a.cited.slice(0, 4)) q.cited.add(c);
    byQ.set(a.question, q);
  }
  const out = [`Checked ${ai.checked_at}. Your share of voice: ${ai.your_share_of_voice ?? '?'}%. Named instead: ${ai.competitors_named_instead.map((c) => `${c.domain} (${c.share}%)`).join(', ') || 'nobody'}`, 'question | brand mentioned | sites cited'];
  for (const [q, v] of [...byQ].slice(0, 20)) out.push(`${q} | ${v.said.join(', ')} | ${[...v.cited].slice(0, 5).join(', ') || '-'}`);
  if (!byQ.size) out.push(...ai.questions_where_you_are_not_named.slice(0, 20).map((q) => `${q} | no | -`));
  if (ai.cited_sources.length) out.push(`Sites AI cites most: ${ai.cited_sources.join(', ')}`);
  if (ai.blocked_crawlers.length) out.push(`AI crawlers blocked: ${ai.blocked_crawlers.join(', ')}`);
  if (ai.missing_entity_signals.length) out.push(`Missing entity signals: ${ai.missing_entity_signals.slice(0, 6).join('; ')}`);
  if (ai.wrong_facts.length) out.push(`Wrong facts in AI answers: ${ai.wrong_facts.slice(0, 5).join('; ')}`);
  return out.join('\n');
}

export function offpageBlock(x: PlanExtras | undefined, local: boolean): string {
  const out: string[] = [];
  const b = x?.backlinks;
  if (b) {
    out.push(`Referring domains: you ${b.referringDomains ?? '?'}; ${b.competitors.map((c) => `${c.domain} ${c.referringDomains ?? '?'}`).join(', ') || 'no competitors checked'}`);
    out.push(`Link gap: ${b.gap.length} sites link to competitors and not to you${b.gap.length ? ` (${b.gap.slice(0, 10).join(', ')})` : ''}`);
    if (b.broken !== undefined) out.push(`Broken backlinks (links to pages that no longer work): ${b.broken}`);
  } else out.push('Backlinks: not checked yet');
  const p = x?.local;
  if (p) out.push(`Business Profile: ${p.name ?? '?'} · ${p.category ?? 'no category'} · ${p.rating ?? '?'}★ from ${p.reviews ?? 0} reviews · ${p.claimed === false ? 'NOT claimed' : 'claimed'}`);
  else if (local) out.push('Business Profile: not checked yet');
  const missing = x?.aiSearch?.missing_third_party ?? [];
  if (missing.length) out.push(`Profiles missing: ${missing.join(', ')}`);
  return out.join('\n');
}

/** Rule 11: the pages that get a new title and description (indexable pages from the crawl, at most 100). */
export const PAGE_META_LIMIT = 100;
export function pagesBlock(report: ReportModel | null, pages: CleanupPage[], mapping: MappingWorkspace | null): { text: string; urls: string[] } {
  const raw = new Map((report?.pages ?? []).map((p) => [normPlanUrl(p.url), p]));
  const main = new Map<string, string>();
  for (const r of mapping?.rows ?? []) if (r.url && r.primaryKeyword) main.set(normPlanUrl(r.url), r.primaryKeyword);
  const rows = pages.filter((p) => p.indexable).slice(0, PAGE_META_LIMIT);
  const lines = ['url | current title (length) | current meta description (length) | H1 | main keyword'];
  for (const p of rows) {
    const r = raw.get(normPlanUrl(p.url));
    lines.push(`${p.url} | ${short(r?.title ?? '(none)', 90)} (${r?.title?.length ?? 0}) | ${short(r?.description ?? '(none)', 170)} (${r?.description?.length ?? 0}) | ${short(r?.h1 || '(none)', 70)} | ${main.get(normPlanUrl(p.url)) ?? '-'}`);
  }
  return { text: rows.length ? lines.join('\n') : 'none', urls: rows.map((p) => p.url) };
}

export const TITLE_RANGE = [50, 60] as const;
export const META_RANGE = [140, 155] as const;
export const isKeep = (v: string) => !v.trim() || v.trim().toLowerCase() === 'keep';

// ---- The answer --------------------------------------------------------------------------------

const MODEL_CATEGORIES = ['technical', 'on_page', 'content', 'aeo', 'off_page', 'local', 'tracking'] as const;
const MODEL_DOERS = ['auto', 'approve', 'team', 'client'] as const;
const MODEL_ITEMS = ['none', 'meta_title', 'meta_description', 'canonical', 'alt_text', 'h1', 'schema'] as const;

const taskZ = z.object({
  id: z.string(), week: z.number(), title: z.string(), why: z.string(), change: z.string(), urls: z.array(z.string()), keywords: z.array(z.string()),
  category: z.enum(MODEL_CATEGORIES), doer: z.enum(MODEL_DOERS), site_wide_item: z.enum(MODEL_ITEMS), page_group: z.enum(PAGE_GROUPS),
  issue_ids: z.array(z.string()), depends_on: z.array(z.string()), success_check: z.string(), check_after_days: z.number(),
  impact: z.number(), confidence: z.number(), effort: z.number(),
});
export const planAnswerZ = z.object({
  summary: z.string(),
  baseline_and_targets: z.array(z.object({ metric: z.string(), now: z.string(), month_3_target: z.string(), month_6_target: z.string() })),
  months: z.array(z.object({ month: z.number(), theme: z.string(), goal: z.string(), tasks: z.array(taskZ) })),
  later: z.array(z.object({ title: z.string(), reason_deferred: z.string() })),
  needs_developer: z.array(z.object({ issue_id: z.string(), issue: z.string(), reason: z.string() })),
  page_meta: z.array(z.object({ url: z.string(), title: z.string(), description: z.string() })),
  data_gaps: z.array(z.string()),
});
export type PlanAnswer = z.infer<typeof planAnswerZ>;

const str = { type: 'string' };
const num = { type: 'number' };
const strs = { type: 'array', items: str };
const en = (v: readonly string[]) => ({ type: 'string', enum: [...v] });
const arr = (items: unknown) => ({ type: 'array', items });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const PLAN_ANSWER_SCHEMA = obj({
  summary: str,
  baseline_and_targets: arr(obj({ metric: str, now: str, month_3_target: str, month_6_target: str })),
  months: arr(obj({
    month: num, theme: str, goal: str,
    tasks: arr(obj({
      id: str, week: num, title: str, why: str, change: str, urls: strs, keywords: strs,
      category: en(MODEL_CATEGORIES), doer: en(MODEL_DOERS), site_wide_item: en(MODEL_ITEMS), page_group: en(PAGE_GROUPS),
      issue_ids: strs, depends_on: strs, success_check: str, check_after_days: num, impact: num, confidence: num, effort: num,
    })),
  })),
  later: arr(obj({ title: str, reason_deferred: str })),
  needs_developer: arr(obj({ issue_id: str, issue: str, reason: str })),
  page_meta: arr(obj({ url: str, title: str, description: str })),
  data_gaps: strs,
});

const DOER: Record<(typeof MODEL_DOERS)[number], TaskDoer> = { auto: 'automatic_no_approval', approve: 'automatic', team: 'team', client: 'client' };
const RECURRING = /\b(re-?test|every (week|month)|weekly|monthly)\b/i;

/** The model's answer in the action plan's task shape ("aeo" is the plan's AI visibility category). */
export function toAiPlan(a: PlanAnswer): AiPlan {
  return {
    summary: a.summary,
    baseline_and_targets: a.baseline_and_targets,
    removed_keywords: [],
    page_map: [],
    months: a.months.map((m) => ({
      month: m.month, theme: m.theme, goal: m.goal,
      tasks: m.tasks.map((t): AiPlanTask => ({
        id: t.id, week: t.week, title: t.title, why: t.why, urls: t.urls, keywords: t.keywords, change: t.change,
        category: (t.category === 'aeo' ? 'ai_visibility' : t.category) as TaskCategory, doer: DOER[t.doer],
        impact: t.impact, confidence: t.confidence, effort: t.effort, priority: 0, depends_on: t.depends_on,
        success_check: t.success_check, check_after_days: t.check_after_days, site_wide_item: t.site_wide_item, page_group: t.page_group,
        area: '', issue_ids: t.issue_ids, recurring: RECURRING.test(t.title),
      })),
    })),
    later: a.later,
    data_gaps: a.data_gaps,
  };
}

// ---- One call ------------------------------------------------------------------------------------

/** Longest wait for the answer (background mode: no request stays open meanwhile). */
export const PLAN_WAIT_MS = 15 * 60_000;
/** First output limit; an answer cut off at it is asked again with double, up to MAX_OUTPUT_TOKENS. */
export const PLAN_OUTPUT_TOKENS = 32_000;
export const MAX_OUTPUT_TOKENS = 100_000;

export type PlanPrompt = { system: string; user: string };
export function planPrompt(blocks: { business: string; audit: PlanIssue[]; siteCheck: string[]; keywords: string; ai: string; offpage: string; pages?: string }, minTasks: number): PlanPrompt {
  const issueLines = blocks.audit.map((i) => `${i.issue_id} | ${i.issue} | ${i.severity} | ${i.affected_url_count} | ${i.example_urls.join(' ')}`);
  const user = [
    `<business>\n${blocks.business}\n</business>`,
    `<audit_issues>\nissue_id | issue | severity | affected_count | up to 5 example URLs\n${issueLines.join('\n') || 'none'}\n</audit_issues>`,
    `<site_check>\n${blocks.siteCheck.join('\n')}\n</site_check>`,
    `<keywords>\n${blocks.keywords}\n</keywords>`,
    `<ai_visibility>\n${blocks.ai}\n</ai_visibility>`,
    `<offpage>\n${blocks.offpage}\n</offpage>`,
    `<pages>\n${blocks.pages || 'none'}\n</pages>`,
  ].join('\n\n');
  const aim = minTasks > 12 ? `\nAim for ${minTasks} tasks a month on this plan.` : '';
  return { system: `${PLAN_PROMPT_INTRO}\n\n${PLAN_PROMPT_RULES}\n${PLAN_PROMPT_PAGE_META}${aim}\n\n${PLAN_PROMPT_OUTPUT}`, user };
}

export async function askForPlan(client: OpenAiClient, prompt: PlanPrompt): Promise<{ answer: PlanAnswer; tokens: number; model: string }> {
  let limit = PLAN_OUTPUT_TOKENS;
  let tokens = 0;
  let last: unknown;
  // An answer cut off at the output limit (reasoning tokens count too) is asked again with double the
  // limit; any other failure is retried once.
  for (let attempt = 1, failures = 0; attempt <= 4 && failures < 2; attempt++) {
    try {
      const r = await client.generateJson({
        system: prompt.system, user: prompt.user, name: 'six_month_plan', jsonSchema: PLAN_ANSWER_SCHEMA, parse: planAnswerZ,
        maxOutputTokens: limit, timeoutMs: PLAN_WAIT_MS, background: { maxWaitMs: PLAN_WAIT_MS },
      });
      return { answer: r.data, tokens: tokens + r.tokens, model: r.model };
    } catch (err) {
      last = err;
      if (err instanceof OpenAiCutOffError && limit < MAX_OUTPUT_TOKENS) limit = Math.min(MAX_OUTPUT_TOKENS, limit * 2);
      else failures++;
    }
  }
  throw new Error(`The plan could not be written: ${last instanceof Error ? last.message : String(last)}`);
}
