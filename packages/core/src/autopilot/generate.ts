import type { ActionItem } from '../actions/actions';
import type { PageContent } from '../audit/page-content';
import type { InventoryItem, SiteInventory } from '../connections/inventory';
import type { OpenAiClient } from '../providers/openai';
import type { WpChangeType, WpTarget } from '../providers/wordpress';
import { draftBlock, draftMeta, type MetaAsk } from './ai-drafts';
import { checkAlt, checkBlock, checkDescription, checkTitle, type BusinessProfile } from './quality';
import { matchRedirects, type DeadUrl } from './redirects';
import { itemPriority, workItemId, type InternalChangeType, type WorkItem, type WorkItemStatus } from './work-items';

/**
 * WordPress autopilot, phase 3: turns plan tasks into exact, checked changes (work items), using the
 * site's inventory (what WordPress stores), the live pages (what visitors see), the keyword map and
 * the business profile. Nothing is sent to the site here; the scheduler applies drafts (phase 4).
 */
export type GenerateInput = {
  accountId: string;
  domain: string;
  actions: ActionItem[];
  inventory: SiteInventory;
  /** Live pages by address (any form; matched without scheme, www and trailing slash). */
  live: PageContent[];
  profile: BusinessProfile;
  /** Page address → its main keyword (page plan). */
  keywords: Map<string, string>;
  /** Addresses that still get clicks or links but answer 404. */
  deadUrls: DeadUrl[];
  /** Image address → alt text drafted earlier (Module 2 alt-text drafts). */
  altDrafts?: Map<string, string>;
  /** The live robots.txt (null = not read), for the sitemap line. */
  robotsTxt?: string | null;
  ai?: OpenAiClient | null;
  /** Vision alt-text drafting, injected so tests run without the model. */
  draftAlt?: (items: { page: string; src: string; title: string | null; h1: string | null }[]) => Promise<{ src: string; alt: string }[]>;
  now?: Date;
};
export type GenerateResult = { items: WorkItem[]; tokens: number; notes: string[] };

/** Same page whatever the scheme, www or trailing slash. */
export const pageKey = (url: string) => url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

type Ctx = {
  input: GenerateInput;
  inv: Map<string, InventoryItem>;
  live: Map<string, PageContent>;
  now: string;
  items: WorkItem[];
  tokens: number;
  notes: string[];
};

function push(c: Ctx, a: ActionItem | null, w: { type: WpChangeType | InternalChangeType | 'manual'; target: WpTarget | null; url: string | null; label: string; before: unknown; newValue: unknown; status: WorkItemStatus; reason?: string | null; priorityBoost?: number; week?: number }) {
  const actionId = a?.id ?? 'autopilot';
  const id = workItemId(c.input.domain, actionId, w.type, w.target, w.newValue);
  if (c.items.some((x) => x.id === id)) return;
  c.items.push({
    id,
    accountId: c.input.accountId,
    domain: c.input.domain,
    actionId,
    taskId: a?.plan?.taskId ?? null,
    type: w.type,
    target: w.target,
    url: w.url,
    label: w.label,
    before: w.before,
    newValue: w.newValue,
    status: w.status,
    reason: w.reason ?? null,
    priority: itemPriority(a?.severity ?? 'high', (a?.priority ?? 0) + (w.priorityBoost ?? 0)),
    month: a?.plan?.month ?? 1,
    week: w.week ?? a?.plan?.week ?? 1,
    dependsOn: [],
    createdAt: c.now,
    scheduledFor: null,
    appliedAt: null,
    verifiedAt: null,
    attempts: 0,
  });
}

/** The pages a task covers, as inventory items (all indexable pages for a site-wide batch without a list). */
function pagesOf(c: Ctx, a: ActionItem): InventoryItem[] {
  const urls = [...(a.plan?.pages ?? []).map((p) => p.url), ...a.urls, ...(a.changes ?? []).map((x) => x.data?.url ?? '').filter(Boolean)];
  const found = [...new Set(urls.map(pageKey))].map((k) => c.inv.get(k)).filter((x): x is InventoryItem => Boolean(x));
  if (found.length || !a.plan?.siteWideItem) return found;
  return c.input.inventory.items.filter((i) => i.url && !i.noindex && ['page', 'post', 'product'].includes(i.type));
}

const nameOf = (i: InventoryItem) => (i.isFrontPage ? 'Homepage' : i.name);
const target = (i: InventoryItem): WpTarget => (['category', 'product_cat'].includes(i.type) ? { term_id: i.id, taxonomy: i.type } : { post_id: i.id });

/** What the task asks for. */
type Kind = 'meta_title' | 'meta_description' | 'h1' | 'canonical' | 'alt_text' | 'schema' | 'open_graph' | 'weekly_check' | 'answer' | 'faq' | 'redirects' | 'sitemap_submit' | 'ai_check' | 'person';
function kindOf(a: ActionItem): Kind {
  const s = a.plan?.siteWideItem;
  if (s && s !== 'none') return s === 'alt_text' ? 'alt_text' : (s as Kind);
  const text = `${a.title} ${a.plan?.change ?? ''}`.toLowerCase();
  if (/\bsitemap\b/.test(text) && /\bsubmit/.test(text)) return 'sitemap_submit';
  if (/\b(ai[- ]visibility|ai search|chatgpt|perplexity)\b/.test(text) && /\b(baseline|check|retest|re-test|test)\b/.test(text)) return 'ai_check';
  if (/\bdirect answer\b/.test(text)) return 'answer';
  if (/\bfaq\b|frequently asked/.test(text)) return 'faq';
  if (/\bredirect/.test(text)) return 'redirects';
  if (/\btitle tags?\b|\bnew titles?\b|\bmeta titles?\b/.test(text)) return 'meta_title';
  if (/\bmeta descriptions?\b/.test(text)) return 'meta_description';
  if (/\b(main heading|h1)\b/.test(text)) return 'h1';
  if (/\bcanonical/.test(text)) return 'canonical';
  if (/\balt text\b/.test(text)) return 'alt_text';
  if (/\bschema\b|structured data/.test(text)) return 'schema';
  return 'person';
}

/** The plan's drafted value for a page (changes on the action, else the page rows), if any. */
function plannedValue(a: ActionItem, field: 'title' | 'meta', i: InventoryItem): string | null {
  const k = pageKey(i.url ?? '');
  const ch = (a.changes ?? []).find((x) => x.id === field && pageKey(x.data?.url ?? a.urls[0] ?? '') === k);
  if (ch?.suggested?.trim()) return ch.suggested.trim();
  const row = (a.plan?.pages ?? []).find((p) => pageKey(p.url) === k);
  return row?.after?.trim() || null;
}

/** The suffix the site adds to every title on its own (live title = stored title + suffix), if any. */
function autoSuffix(c: Ctx): string | null {
  const seen = new Map<string, number>();
  for (const i of c.input.inventory.items) {
    const l = i.url ? c.live.get(pageKey(i.url)) : undefined;
    if (!l?.title || !i.seoTitle || l.title === i.seoTitle || !l.title.startsWith(i.seoTitle)) continue;
    const s = l.title.slice(i.seoTitle.length);
    seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  const best = [...seen].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

const decode = (s: string | null | undefined) => (s ?? '').replace(/&#0?38;|&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&quot;/g, '"').replace(/&#039;|&#8217;/g, '’').trim() || null;

async function metaItems(c: Ctx, jobs: { a: ActionItem; field: 'title' | 'description'; page: InventoryItem }[]): Promise<void> {
  if (!jobs.length) return;
  const { profile } = c.input;
  const suffix = autoSuffix(c);
  const ctx = { suffix, brand: profile.name };
  const liveOf = (i: InventoryItem) => (i.url ? c.live.get(pageKey(i.url)) : undefined);
  const currentTitle = (i: InventoryItem) => decode(liveOf(i)?.title) ?? i.titleTag ?? i.seoTitle;
  const currentDesc = (i: InventoryItem) => decode(liveOf(i)?.description) ?? i.metaDescription;
  const allTitles = c.input.inventory.items.map((i) => currentTitle(i)?.toLowerCase()).filter(Boolean) as string[];
  const allDescs = c.input.inventory.items.map((i) => currentDesc(i)?.toLowerCase()).filter(Boolean) as string[];
  const others = (list: string[], own: string | null) => new Set(list.filter((x) => x !== own?.toLowerCase()));

  type Job = { a: ActionItem; field: 'title' | 'description'; page: InventoryItem; draft: string | null; problems: string[] };
  const check = (j: Job, v: string) => {
    const i = j.page;
    return j.field === 'title'
      ? checkTitle(v, { mainKeyword: c.input.keywords.get(pageKey(i.url ?? '')) ?? null, ctx, others: others(allTitles, currentTitle(i)), current: currentTitle(i), currentDescription: currentDesc(i), profile })
      : checkDescription(v, { others: others(allDescs, currentDesc(i)), current: currentDesc(i), profile, pageText: liveOf(i)?.text ?? '' });
  };
  const open: Job[] = [];
  for (const j of jobs) {
    const now = j.field === 'title' ? currentTitle(j.page) : currentDesc(j.page);
    // KEEP rule: a current value that passes stays, whatever the draft says.
    if (now && !check({ ...j, draft: null, problems: [] }, now).length) {
      push(c, j.a, { type: j.field === 'title' ? 'meta_title' : 'meta_description', target: target(j.page), url: j.page.url, label: `${j.field === 'title' ? 'Title tag' : 'Meta description'} · ${nameOf(j.page)}`, before: now, newValue: null, status: 'keep', reason: 'The current text already meets every rule.' });
      continue;
    }
    const planned = plannedValue(j.a, j.field === 'title' ? 'title' : 'meta', j.page);
    const why = now ? check({ ...j, draft: null, problems: [] }, now) : ['missing'];
    open.push({ ...j, draft: planned, problems: planned ? check({ ...j, draft: null, problems: [] }, planned) : [`no draft yet (current: ${why.join('; ')})`] });
  }
  // Up to two model rounds: drafts that fail (or are missing) go back with their problems.
  for (let round = 0; round < 2 && c.input.ai; round++) {
    const ask = open.filter((j) => j.problems.length);
    if (!ask.length) break;
    const byPage = new Map<string, MetaAsk>();
    for (const j of ask) {
      const k = j.page.url!;
      const m = byPage.get(k) ?? { url: k, name: nameOf(j.page), mainKeyword: c.input.keywords.get(pageKey(k)) ?? null, currentTitle: currentTitle(j.page), currentDescription: currentDesc(j.page), excerpt: liveOf(j.page)?.text ?? '', want: {} };
      m.want[j.field] = j.problems;
      byPage.set(k, m);
    }
    try {
      for (let n = 0; n < byPage.size; n += 10) {
        const r = await draftMeta(c.input.ai, [...byPage.values()].slice(n, n + 10), profile, suffix);
        c.tokens += r.tokens;
        for (const j of ask) {
          const d = r.drafts.get(j.page.url!);
          const v = d ? (j.field === 'title' ? d.title : d.description) : '';
          if (v) {
            j.draft = v;
            j.problems = check(j, v);
          }
        }
      }
    } catch (err) {
      c.notes.push(`Drafting titles and descriptions failed: ${err instanceof Error ? err.message.slice(0, 120) : 'model error'}`);
      break;
    }
  }
  for (const j of open) {
    const type = j.field === 'title' ? 'meta_title' : 'meta_description';
    const label = `${j.field === 'title' ? 'Title tag' : 'Meta description'} · ${nameOf(j.page)}`;
    const before = j.field === 'title' ? currentTitle(j.page) : currentDesc(j.page);
    // Plugin values are what the SEO field stores: the title without a suffix the site adds itself.
    const value = j.draft && j.field === 'title' && suffix && j.draft.endsWith(suffix) ? j.draft.slice(0, -suffix.length) : j.draft;
    if (j.draft && !j.problems.length) push(c, j.a, { type, target: target(j.page), url: j.page.url, label, before, newValue: value, status: 'draft' });
    else push(c, j.a, { type, target: target(j.page), url: j.page.url, label, before, newValue: value, status: 'needs_human', reason: `Draft did not pass the rules: ${j.problems.join('; ')}` });
  }
}

function h1Item(c: Ctx, a: ActionItem, i: InventoryItem) {
  const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
  const liveH1 = live ? live.headings.filter((h) => h.level === 1).length : null;
  const label = `Main heading (H1) · ${nameOf(i)}`;
  if (liveH1 === null) return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: null, newValue: null, status: 'needs_human', reason: 'The live page could not be read.' });
  if (liveH1 === 1) return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: 1, newValue: null, status: 'keep', reason: 'The page has exactly one H1.' });
  if (liveH1 === 0) {
    const text = i.isFrontPage ? c.input.profile.name : i.name;
    const ok = i.builder === 'gutenberg' || i.builder === 'classic';
    return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: 0, newValue: { action: 'add_h1', text }, status: ok ? 'draft' : 'needs_human', reason: ok ? null : `Add the H1 “${text}” in ${i.builder ?? 'the page builder'}.` });
  }
  // More than one H1: H1s outside the content come from the theme; keep at most one in total.
  const theme = Math.max(0, liveH1 - i.h1s.length);
  if (!i.h1s.length) return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: liveH1, newValue: null, status: 'needs_human', reason: 'The extra H1 comes from the theme or a template, not the page content.' });
  push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: liveH1, newValue: { action: 'demote_extra_h1', keep: theme ? 0 : 1 }, status: 'draft' });
}

function canonicalItem(c: Ctx, a: ActionItem, i: InventoryItem) {
  const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
  const label = `Canonical · ${nameOf(i)}`;
  const now = live?.canonical ?? null;
  if (now && pageKey(now) === pageKey(i.url ?? '')) return push(c, a, { type: 'canonical', target: target(i), url: i.url, label, before: now, newValue: null, status: 'keep', reason: 'Already points to itself.' });
  push(c, a, { type: 'canonical', target: target(i), url: i.url, label, before: now, newValue: i.url, status: 'draft', reason: now ? `Pointed to ${now}.` : 'No canonical on the page.', priorityBoost: now ? 5 : 0, week: 1 });
}

function schemaItems(c: Ctx, a: ActionItem, i: InventoryItem) {
  const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
  const have = new Set((live?.schemaTypes ?? []).map((t) => t.toLowerCase()));
  const origin = c.input.inventory.status.home_url.replace(/\/+$/, '');
  if (i.isFrontPage) {
    if (!have.has('organization') && !have.has('localbusiness') && !have.has('corporation')) {
      push(c, a, { type: 'schema', target: { site: true }, url: i.url, label: 'Organization schema · Homepage', before: null, newValue: { block_id: 'organization', json: { '@context': 'https://schema.org', '@type': 'Organization', name: c.input.profile.name, url: `${origin}/`, ...(c.input.profile.places.length ? { areaServed: c.input.profile.places } : {}) } }, status: 'draft' });
    } else push(c, a, { type: 'schema', target: { site: true }, url: i.url, label: 'Organization schema · Homepage', before: 'Organization', newValue: null, status: 'keep', reason: 'The page already prints Organization schema.' });
    if (!have.has('website')) push(c, a, { type: 'schema', target: { site: true }, url: i.url, label: 'WebSite schema · Homepage', before: null, newValue: { block_id: 'website', json: { '@context': 'https://schema.org', '@type': 'WebSite', name: c.input.profile.name, url: `${origin}/` } }, status: 'draft' });
    return;
  }
  if (have.has('breadcrumblist')) return push(c, a, { type: 'schema', target: target(i), url: i.url, label: `Breadcrumb schema · ${i.name}`, before: 'BreadcrumbList', newValue: null, status: 'keep', reason: 'The page already prints BreadcrumbList.' });
  push(c, a, {
    type: 'schema', target: target(i), url: i.url, label: `Breadcrumb schema · ${i.name}`, before: null, status: 'draft',
    newValue: { block_id: `breadcrumb-${i.id}`, json: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: i.name, item: i.url },
    ] } },
  });
}

async function altItems(c: Ctx, a: ActionItem, pages: InventoryItem[]) {
  const want: { page: InventoryItem; src: string; id: number | null; title: string | null; h1: string | null }[] = [];
  for (const i of pages) {
    const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
    for (const img of live?.images ?? []) {
      // Inline placeholders (data: addresses, lazy-load SVGs) are not real images.
      if (img.alt !== undefined && img.alt.trim() !== '') continue;
      if (/^data:/i.test(img.src) || /\.svg(\?|$)|svg%3e/i.test(img.src)) continue;
      const known = i.images.find((m) => m.url === img.src || img.src.startsWith(m.url.replace(/\.[a-z]+$/i, '')));
      want.push({ page: i, src: img.src, id: known?.id ?? null, title: live?.title ?? null, h1: live?.headings.find((h) => h.level === 1)?.text ?? null });
    }
  }
  if (!want.length) {
    for (const i of pages) push(c, a, { type: 'image_alt', target: target(i), url: i.url, label: `Image alt text · ${nameOf(i)}`, before: null, newValue: null, status: 'keep', reason: 'Every image already has alt text.' });
    return;
  }
  const drafts = new Map(c.input.altDrafts ?? []);
  const missing = want.filter((w) => w.id && !drafts.has(w.src));
  if (missing.length && c.input.draftAlt) {
    try {
      for (const d of await c.input.draftAlt(missing.map((w) => ({ page: w.page.url ?? '', src: w.src, title: w.title, h1: w.h1 })))) drafts.set(d.src, d.alt);
    } catch (err) {
      c.notes.push(`Alt text drafting failed: ${err instanceof Error ? err.message.slice(0, 120) : 'model error'}`);
    }
  }
  for (const w of want) {
    const label = `Image alt text · ${nameOf(w.page)} · ${w.src.split('/').pop()}`;
    if (!w.id) {
      push(c, a, { type: 'image_alt', target: null, url: w.page.url, label, before: null, newValue: { src: w.src }, status: 'needs_human', reason: 'This image is not in the Media Library (theme or builder image); add the alt text where it is set.' });
      continue;
    }
    const alt = drafts.get(w.src) ?? '';
    const problems = alt ? checkAlt(alt, c.input.profile) : ['no draft yet'];
    push(c, a, { type: 'image_alt', target: { attachment_id: w.id }, url: w.page.url, label, before: null, newValue: { alt, post_ids: [w.page.id] }, status: problems.length ? 'needs_human' : 'draft', reason: problems.length ? `Alt text needs a person: ${problems.join('; ')}` : null });
  }
}

async function blockItems(c: Ctx, a: ActionItem, kind: 'answer' | 'faq', pages: InventoryItem[]) {
  for (const i of pages.slice(0, 5)) {
    const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
    const label = `${kind === 'answer' ? 'Direct answer' : 'FAQ'} · ${nameOf(i)}`;
    const editable = i.builder === 'gutenberg' || i.builder === 'classic';
    if (kind === 'faq' && live?.faqMarkup) {
      push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: 'FAQ', newValue: null, status: 'keep', reason: 'The page already has an FAQ.' });
      continue;
    }
    let answer = '';
    let faq: { q: string; a: string }[] = [];
    let problems: string[] = ['no draft yet'];
    const source = `${live?.text ?? ''} ${c.input.profile.places.join(' ')}`;
    for (let round = 0; round < 2 && c.input.ai && problems.length; round++) {
      try {
        const r = await draftBlock(c.input.ai, { kind, url: i.url ?? '', name: nameOf(i), mainKeyword: c.input.keywords.get(pageKey(i.url ?? '')) ?? null, text: live?.text ?? '', problems: round ? problems : [] }, c.input.profile);
        c.tokens += r.tokens;
        answer = r.answer;
        faq = r.faq.slice(0, 5);
        problems = kind === 'answer'
          ? checkBlock(answer, { kind: 'answer', profile: c.input.profile, sourceText: source })
          : faq.length < 3 ? ['fewer than 3 questions'] : faq.flatMap((f) => checkBlock(`${f.q} ${f.a}`, { kind: 'faq', profile: c.input.profile, sourceText: source }));
      } catch (err) {
        c.notes.push(`Drafting the ${label} failed: ${err instanceof Error ? err.message.slice(0, 120) : 'model error'}`);
        break;
      }
    }
    const value = kind === 'answer'
      ? { block_id: `answer-${i.id}`, kind, position: 'after_h1', html: `<p>${answer.replace(/</g, '&lt;')}</p>` }
      : { block_id: `faq-${i.id}`, kind, position: 'end', faq };
    if (problems.length) push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: answer || faq.length ? value : null, status: 'needs_human', reason: `Draft did not pass the rules: ${problems.join('; ')}` });
    else if (!editable) push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: value, status: 'needs_human', reason: `This page is built with ${i.builder}; paste the drafted ${kind === 'answer' ? 'answer' : 'FAQ'} in the page builder.` });
    else push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: value, status: 'draft' });
  }
}

function redirectItems(c: Ctx, a: ActionItem | null) {
  const live = c.input.inventory.items.filter((i) => i.url && !i.noindex).map((i) => ({ url: i.url!, name: i.name }));
  for (const m of matchRedirects(c.input.deadUrls, live)) {
    const label = `301 redirect · ${m.from.replace(/^https?:\/\/[^/]+/, '')}`;
    if (!m.to) push(c, a, { type: 'redirect_301', target: { site: true }, url: m.from, label, before: null, newValue: { from: m.from }, status: 'needs_human', reason: `No live page clearly replaces it (best match ${m.score}); choose where it should go.` });
    else push(c, a, { type: 'redirect_301', target: { site: true }, url: m.from, label, before: null, newValue: { from: m.from, to: m.to }, status: 'draft', reason: `${m.why}; closest live page (match ${m.score}).`, priorityBoost: 10, week: 1 });
  }
}

/** The sitemap Google should read: MS SCORE's once it is switched on, else the one the site serves. */
export function sitemapUrl(inv: SiteInventory): string | null {
  const st = inv.status;
  if (st.sitemap.by === 'msscore' || (st.seo_plugin === 'none' && ['none', 'wordpress'].includes(st.sitemap.by))) return `${st.home_url.replace(/\/+$/, '')}/sitemap.xml`;
  return st.sitemap.url;
}

/** A short factual summary for AI assistants (llms.txt): who the business is and its main pages. Dated by month, so it is refreshed monthly. */
export function llmsText(profile: BusinessProfile, inventory: SiteInventory, now = new Date()): string {
  const home = inventory.items.find((i) => i.isFrontPage);
  const pages = inventory.items
    .filter((i) => i.url && !i.noindex && !i.isFrontPage && ['page', 'product_cat', 'category', 'product', 'post'].includes(i.type))
    .sort((a, b) => ['page', 'product_cat', 'category', 'product', 'post'].indexOf(a.type) - ['page', 'product_cat', 'category', 'product', 'post'].indexOf(b.type))
    .slice(0, 25);
  const what = [profile.services?.slice(0, 6).join(', '), profile.places.length ? `in ${profile.places.slice(0, 4).join(', ')}` : ''].filter(Boolean).join(' ');
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').trim();
  return [
    `# ${clean(profile.name)}`,
    '',
    ...(what ? [`> ${clean(profile.name)}: ${clean(what)}.`, ''] : []),
    '## Main pages',
    `- [Homepage](${home?.url ?? inventory.status.home_url})`,
    ...pages.map((i) => `- [${clean(i.name)}](${i.url})`),
    '',
    `Updated: ${now.toISOString().slice(0, 7)}`,
    '',
  ].join('\n');
}

/**
 * Site files every site should have, whatever the plan says: a clean XML sitemap (when no SEO
 * plugin makes one; WordPress's own wp-sitemap.xml lists noindex and thin pages), robots.txt naming
 * that sitemap, and llms.txt for AI assistants.
 */
function siteFileItems(c: Ctx) {
  const st = c.input.inventory.status;
  const ext = st as typeof st & { llms_served?: boolean; robots_managed?: boolean };
  const by = st.sitemap.by;
  if (by === 'msscore') push(c, null, { type: 'sitemap', target: { site: true }, url: st.sitemap.url, label: 'XML sitemap', before: { enabled: true }, newValue: null, status: 'keep', reason: 'MS SCORE’s sitemap is on and updates itself when pages change.' });
  else if (st.seo_plugin !== 'none' && by !== 'none' && by !== 'wordpress') push(c, null, { type: 'sitemap', target: { site: true }, url: st.sitemap.url, label: 'XML sitemap', before: by, newValue: null, status: 'keep', reason: `${by} already makes the sitemap.` });
  else push(c, null, { type: 'sitemap', target: { site: true }, url: st.home_url.replace(/\/+$/, '') + '/sitemap.xml', label: by === 'wordpress' ? 'XML sitemap (replace WordPress’s basic one)' : 'Create the XML sitemap', before: { enabled: false, by, url: st.sitemap.url }, newValue: { enabled: true }, status: 'draft', reason: by === 'wordpress' ? 'WordPress’s own sitemap lists noindex pages and has no images or dates; MS SCORE’s leaves them out and updates itself.' : 'The site has no sitemap, so Google has no list of its pages.', priorityBoost: 20, week: 1 });

  // Resubmitted every month (and after the sitemap changes), even when no task asks for it.
  const sm = sitemapUrl(c.input.inventory);
  if (sm && !c.items.some((i) => i.type === 'gsc_sitemap_submit')) push(c, null, { type: 'gsc_sitemap_submit', target: null, url: sm, label: 'Submit the sitemap to Search Console', before: null, newValue: { sitemap: sm, month: c.now.slice(0, 7) }, status: 'draft', week: 1 });

  const robots = c.input.robotsTxt;
  const sitemapLine = robots ? /^\s*sitemap:/im.test(robots) : false;
  if (ext.robots_managed) push(c, null, { type: 'robots_txt', target: { site: true }, url: st.home_url, label: 'robots.txt', before: true, newValue: null, status: 'keep', reason: 'MS SCORE already manages robots.txt.' });
  else if (robots !== undefined && !sitemapLine) push(c, null, { type: 'robots_txt', target: { site: true }, url: st.home_url, label: 'robots.txt: name the sitemap', before: robots, newValue: { enabled: true }, status: 'draft', reason: 'robots.txt does not tell search engines where the sitemap is.', week: 1 });

  if (st.llms_file) push(c, null, { type: 'llms_txt', target: { site: true }, url: null, label: 'llms.txt for AI assistants', before: 'file', newValue: null, status: 'keep', reason: 'The site has its own llms.txt file.' });
  else push(c, null, { type: 'llms_txt', target: { site: true }, url: st.home_url, label: ext.llms_served ? 'llms.txt for AI assistants (monthly refresh)' : 'llms.txt for AI assistants', before: null, newValue: { content: llmsText(c.input.profile, c.input.inventory, c.input.now) }, status: 'draft', week: 2 });
}

export async function generateWorkItems(input: GenerateInput): Promise<GenerateResult> {
  const c: Ctx = {
    input,
    inv: new Map(input.inventory.items.filter((i) => i.url).map((i) => [pageKey(i.url!), i])),
    live: new Map(input.live.map((p) => [pageKey(p.url), p])),
    now: (input.now ?? new Date()).toISOString(),
    items: [],
    tokens: 0,
    notes: [],
  };
  const meta: { a: ActionItem; field: 'title' | 'description'; page: InventoryItem }[] = [];
  let redirectsDone = false;
  for (const a of input.actions.filter((x) => x.status !== 'dismissed' && x.status !== 'done' && x.status !== 'verified')) {
    const doer = a.plan?.doer;
    const kind = kindOf(a);
    const pages = pagesOf(c, a);
    if (kind === 'sitemap_submit') push(c, a, { type: 'gsc_sitemap_submit', target: null, url: sitemapUrl(input.inventory), label: 'Submit the sitemap to Search Console', before: null, newValue: { sitemap: sitemapUrl(input.inventory), month: c.now.slice(0, 7) }, status: 'draft', week: 1 });
    else if (kind === 'ai_check') push(c, a, { type: 'ai_visibility_check', target: null, url: null, label: a.title, before: null, newValue: null, status: 'draft' });
    else if (kind === 'weekly_check') push(c, a, { type: 'weekly_page_check', target: null, url: null, label: 'Check new and changed pages every week', before: null, newValue: null, status: 'draft' });
    else if (kind === 'meta_title' || kind === 'meta_description') for (const p of pages) meta.push({ a, field: kind === 'meta_title' ? 'title' : 'description', page: p });
    else if (kind === 'h1') for (const p of pages) h1Item(c, a, p);
    else if (kind === 'canonical') for (const p of pages) canonicalItem(c, a, p);
    else if (kind === 'schema') for (const p of pages) schemaItems(c, a, p);
    else if (kind === 'alt_text') await altItems(c, a, pages);
    else if (kind === 'answer' || kind === 'faq') await blockItems(c, a, kind, pages.length ? pages : input.inventory.items.filter((i) => i.isFrontPage));
    else if (kind === 'redirects') {
      redirectItems(c, a);
      redirectsDone = true;
    } else if (kind === 'open_graph') {
      for (const p of pages) {
        const live = p.url ? c.live.get(pageKey(p.url)) : undefined;
        const ok = live?.openGraph?.title && live.openGraph.description;
        push(c, a, { type: 'og_tags', target: target(p), url: p.url, label: `Social sharing tags · ${nameOf(p)}`, before: null, newValue: ok ? null : { title: decode(live?.title), description: decode(live?.description) }, status: ok ? 'keep' : 'draft', reason: ok ? 'Open Graph title and description are already there.' : null });
      }
    } else {
      const status: WorkItemStatus = doer === 'client' ? 'client' : doer === 'developer' ? 'developer' : 'team';
      push(c, a, { type: 'manual', target: null, url: pages[0]?.url ?? null, label: a.title, before: null, newValue: null, status, reason: 'Not a change the plugin makes.' });
    }
  }
  await metaItems(c, meta);
  siteFileItems(c);
  // Dead addresses are fixed in week 1 even when no task mentions redirects.
  if (!redirectsDone && input.deadUrls.length) redirectItems(c, null);
  // Canonicals first, then titles/descriptions/H1s on the same page (the plan's rule).
  for (const it of c.items) {
    if (['meta_title', 'meta_description', 'heading_fix'].includes(it.type) && it.status === 'draft') {
      it.dependsOn = c.items.filter((x) => x.type === 'canonical' && x.status === 'draft' && x.url && it.url && pageKey(x.url) === pageKey(it.url)).map((x) => x.id);
    }
  }
  c.items.sort((x, y) => y.priority - x.priority || x.week - y.week);
  return { items: c.items, tokens: c.tokens, notes: c.notes };
}
