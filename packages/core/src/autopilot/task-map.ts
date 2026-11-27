import type { ActionItem, ActionWorkspace } from '../actions/actions';

/**
 * Plan executor, part A: every plan task gets an action type (what the plugin should do) so the
 * executor can turn it into exact changes. Read from the task's site-wide item when it has one, else
 * from its words; work for people (outreach, reviews, articles, confirmations) is "manual".
 */
export const ACTION_TYPES = [
  'meta_title', 'meta_description', 'canonical', 'robots_noindex', 'heading_fix', 'image_alt', 'schema', 'redirect_301',
  'sitemap', 'robots_txt', 'llms_txt', 'content_block', 'internal_link', 'product_copy', 'og_tags',
  /** MS SCORE's own jobs: submit the sitemap, check AI assistants, weekly page check. */
  'tool', 'manual',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export type BlockKind = 'direct_answer' | 'faq' | 'comparison_table' | 'section';
export type ToolJob = 'sitemap_submit' | 'ai_check' | 'weekly_check';

export type TaskExec = {
  actionType: ActionType;
  block?: BlockKind;
  tool?: ToolJob;
  /** Who does a manual task. */
  manualFor?: 'team' | 'client' | 'developer';
  /** Page addresses the task changes (from the plan, else every indexable page for a site-wide task). */
  targets: string[];
  mappedAt: string;
};

const SITE_WIDE: Record<string, ActionType> = {
  meta_title: 'meta_title', meta_description: 'meta_description', canonical: 'canonical', h1: 'heading_fix',
  alt_text: 'image_alt', schema: 'schema', open_graph: 'og_tags',
};

/** Words → type, first match wins (more specific first). */
const RULES: [RegExp, ActionType, BlockKind?][] = [
  [/\b(direct answer|answer (?:box|block|paragraph)|answer[- ]first)\b/, 'content_block', 'direct_answer'],
  [/\b(faq|frequently asked|questions? (?:section|block))\b/, 'content_block', 'faq'],
  [/\bcomparison (?:table|chart)\b/, 'content_block', 'comparison_table'],
  [/\b301\b|\bredirect/, 'redirect_301'],
  [/\brobots\.txt\b/, 'robots_txt'],
  [/\bllms\.txt\b/, 'llms_txt'],
  [/\b(xml )?sitemap\b/, 'sitemap'],
  [/\bnoindex\b|\bremove (?:from|out of) (?:google|the index)\b/, 'robots_noindex'],
  [/\bcanonical/, 'canonical'],
  [/\bmeta descriptions?\b/, 'meta_description'],
  [/\b(title tags?|meta titles?|seo titles?|new titles?|page titles?)\b/, 'meta_title'],
  [/\b(main heading|h1s?|heading (?:structure|order|levels?))\b/, 'heading_fix'],
  [/\balt(?:ernative)? text\b|\balt tags?\b/, 'image_alt'],
  [/\b(open graph|og tags|social sharing|sharing tags)\b/, 'og_tags'],
  [/\b(schema|structured data|json-ld|breadcrumb markup)\b/, 'schema'],
  [/\binternal links?\b|\blink (?:to|from) (?:the|your|our)\b/, 'internal_link'],
  [/\bproduct (?:descriptions?|copy|text)\b/, 'product_copy'],
];
/** Work only a person can do, whatever the doer says. */
const MANUAL = /\b(outreach|backlinks?|guest post|press|pr\b|citations?|directory|directories|listings?|reviews?|testimonials?|google business profile|business profile|gbp|photos?|video|interview|confirm|sign[- ]?off|merchant center|social media|newsletter|survey|ads?\b|campaign|write (?:a |an |\d+ )?(?:new )?(?:blog|article|post|guide)|new (?:blog )?(?:article|post|guide|page)s?\b|create (?:a |an )?(?:new )?page|publish (?:a |an )?(?:new )?(?:article|post|page))/;
const TOOL: [RegExp, ToolJob][] = [
  [/\bsitemap\b.*\bsubmit|\bsubmit\b.*\bsitemap\b/, 'sitemap_submit'],
  [/\b(ai[- ]visibility|ai search|chatgpt|perplexity|ai assistants?)\b.*\b(baseline|check|re-?test|test|track)/, 'ai_check'],
  [/\b(weekly|every week)\b.*\bcheck\b|\bcheck (?:new|changed) pages\b/, 'weekly_check'],
];

/** The executable shape of one task. */
export function taskExec(a: ActionItem, now = new Date()): Omit<TaskExec, 'targets'> {
  const mappedAt = now.toISOString();
  const text = `${a.title} ${a.plan?.change ?? ''} ${a.detail ?? ''}`.toLowerCase();
  const doer = a.plan?.doer;
  const item = a.plan?.siteWideItem;
  if (item === 'weekly_check') return { actionType: 'tool', tool: 'weekly_check', mappedAt };
  if (item && item !== 'none' && SITE_WIDE[item]) return { actionType: SITE_WIDE[item]!, mappedAt };
  for (const [re, tool] of TOOL) if (re.test(text)) return { actionType: 'tool', tool, mappedAt };
  if (doer === 'client' || doer === 'developer') return { actionType: 'manual', manualFor: doer, mappedAt };
  // Changes on the site are tried before "manual": "Add an FAQ with customer questions" is a content block.
  for (const [re, type, block] of RULES) {
    if (!re.test(text)) continue;
    if (MANUAL.test(text) && !['content_block', 'redirect_301', 'canonical', 'meta_title', 'meta_description', 'heading_fix', 'schema'].includes(type)) break;
    return { actionType: type, ...(block ? { block } : {}), mappedAt };
  }
  if (a.source.kind === 'audit') {
    const byRule: Record<string, ActionType> = { '2.1.1': 'meta_title', '2.1.2': 'meta_title', '2.1.3': 'meta_title', '2.2.1': 'meta_description', '2.2.2': 'meta_description', '2.3.1': 'heading_fix', '2.3.3': 'heading_fix', '2.5.2': 'image_alt', '1.6.1': 'canonical', '1.11.1': 'schema', '1.12.4': 'schema', '2.2.5': 'og_tags', '1.4.1': 'sitemap', '1.2.3': 'robots_txt', '2.8.1': 'content_block', '2.8.2': 'content_block', '1.5.1': 'redirect_301' };
    const t = byRule[a.source.ruleId];
    if (t) return { actionType: t, ...(a.source.ruleId === '2.8.1' ? { block: 'direct_answer' as const } : a.source.ruleId === '2.8.2' ? { block: 'faq' as const } : {}), mappedAt };
  }
  return { actionType: 'manual', manualFor: 'team', mappedAt };
}

/** Same page whatever the scheme, www or trailing slash. */
const key = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

/**
 * Maps every open task that has no action type yet, or whose wording changed (backfills older plans).
 * `pages`: the site's indexable pages (inventory), used for site-wide tasks without their own list.
 */
export function mapPlanTasks(ws: ActionWorkspace, pages: string[] = [], now = new Date()): { ws: ActionWorkspace; changed: number } {
  let changed = 0;
  const actions = ws.actions.map((a) => {
    if (a.status === 'dismissed') return a;
    const e = taskExec(a, now);
    const own = [...new Set([...(a.plan?.pages ?? []).map((p) => p.url), ...a.urls, ...(a.changes ?? []).map((c) => c.data?.url ?? '').filter(Boolean)])];
    const siteWide = Boolean(a.plan?.siteWideItem && a.plan.siteWideItem !== 'none');
    const targets = own.length ? own : siteWide ? pages : [];
    const prev = a.exec;
    if (prev && prev.actionType === e.actionType && prev.block === e.block && prev.tool === e.tool && prev.targets.map(key).join('|') === targets.map(key).join('|')) return a;
    changed++;
    return { ...a, exec: { ...e, targets } };
  });
  return { ws: changed ? { ...ws, actions } : ws, changed };
}
