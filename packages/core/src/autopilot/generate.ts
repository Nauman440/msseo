import type { ActionItem } from '../actions/actions';
import type { PageContent } from '../audit/page-content';
import type { InventoryItem, SiteInventory } from '../connections/inventory';
import type { OpenAiClient } from '../providers/openai';
import type { WpChangeType, WpTarget } from '../providers/wordpress';
import { draftBlock, draftH1, draftMeta, draftPage, draftSection, type DraftedPage, type DraftedSection, type MetaAsk } from './ai-drafts';
import { taskExec } from './task-map';
import { checkAlt, checkBlock, checkDescription, checkH1, checkTitle, type BusinessProfile } from './quality';
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
  /** Page address → the page plan's drafted H1 (Module 5), used before asking the model. */
  h1Drafts?: Map<string, string>;
  /** Changes after "Start over" get new ids (the plugin never applies the same id twice). */
  idSalt?: string;
  /** New pages the page plan asks for (Module 5 rows with action "create"), for "create a page" tasks. */
  newPages?: NewPageSpec[];
  /** The live robots.txt (null = not read), for the sitemap line. */
  robotsTxt?: string | null;
  ai?: OpenAiClient | null;
  /** Vision alt-text drafting, injected so tests run without the model. */
  draftAlt?: (items: { page: string; src: string; title: string | null; h1: string | null }[]) => Promise<{ src: string; alt: string }[]>;
  now?: Date;
};
/** A page the page plan says is missing: its address, keywords and the questions it should answer. */
export type NewPageSpec = { path: string; mainKeyword: string; secondary: string[]; questions: string[]; pageType: string };
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
  /** Pages whose H1 words are checked against their keyword (after the count is fixed). */
  h1Text: { a: ActionItem | null; page: InventoryItem; after: string | null; current?: string }[];
  /** Plan tasks that ask for a site file: its change belongs to that task. */
  fileTask: Partial<Record<'sitemap' | 'robots_txt' | 'llms_txt', ActionItem>>;
};

function push(c: Ctx, a: ActionItem | null, w: { type: WpChangeType | InternalChangeType | 'manual'; target: WpTarget | null; url: string | null; label: string; before: unknown; newValue: unknown; status: WorkItemStatus; reason?: string | null; priorityBoost?: number; week?: number }) {
  const actionId = a?.id ?? 'autopilot';
  const id = workItemId(c.input.idSalt ? `${c.input.domain}#${c.input.idSalt}` : c.input.domain, actionId, w.type, w.target, w.newValue);
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
  const urls = a.exec?.targets?.length ? a.exec.targets : [...(a.plan?.pages ?? []).map((p) => p.url), ...a.urls, ...(a.changes ?? []).map((x) => x.data?.url ?? '').filter(Boolean)];
  const found = [...new Set(urls.map(pageKey))].map((k) => c.inv.get(k)).filter((x): x is InventoryItem => Boolean(x));
  if (found.length || !a.plan?.siteWideItem) return found;
  return c.input.inventory.items.filter((i) => i.url && !i.noindex && ['page', 'post', 'product'].includes(i.type));
}

const nameOf = (i: InventoryItem) => (i.isFrontPage ? 'Homepage' : i.name);
const target = (i: InventoryItem): WpTarget => (['category', 'product_cat'].includes(i.type) ? { term_id: i.id, taxonomy: i.type } : { post_id: i.id });

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

function h1Item(c: Ctx, a: ActionItem | null, i: InventoryItem) {
  const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
  const liveH1 = live ? live.headings.filter((h) => h.level === 1).length : null;
  const label = `Main heading (H1) · ${nameOf(i)}`;
  if (liveH1 === null) return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: null, newValue: null, status: 'needs_human', reason: 'The live page could not be read.' });
  if (liveH1 === 1) {
    // One H1, but it sits right under an H2 title (a hero title + subtitle): the title should be the H1.
    const hs = live!.headings;
    const at = hs.findIndex((h) => h.level === 1);
    const prev = at > 0 ? hs[at - 1] : null;
    if (prev && at === 1 && prev.level === 2 && prev.text.trim() && i.h1s.length) {
      const ok = ['gutenberg', 'classic', 'bricks', 'elementor'].includes(i.builder ?? 'classic') && pluginAtLeast(c, 1, 4, 1);
      push(c, a, {
        type: 'heading_fix', target: target(i), url: i.url, label, before: hs[at]!.text, newValue: { action: 'swap_h1', title: prev.text.trim() }, status: ok ? 'draft' : 'needs_human', week: 1, priorityBoost: 3,
        reason: ok
          ? `The page title “${prev.text.trim()}” is an H2 and the line under it (“${hs[at]!.text}”) is the H1: the title becomes the H1 and the line under it an H2. The look stays the same.`
          : pluginAtLeast(c, 1, 4, 1) ? `Make “${prev.text.trim()}” the H1 and “${hs[at]!.text}” an H2 in ${i.builder ?? 'the page builder'}.` : 'Update the MS SCORE Connector plugin to 1.4.1 or later: it swaps the H1 to the page title.',
      });
      c.h1Text.push({ a, page: i, after: c.items[c.items.length - 1]?.id ?? null, current: prev.text.trim() });
      return;
    }
    c.h1Text.push({ a, page: i, after: null });
    return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: 1, newValue: null, status: 'keep', reason: 'The page has exactly one H1.' });
  }
  if (liveH1 === 0) {
    const text = i.isFrontPage ? c.input.profile.name : i.name;
    const ok = i.builder === 'gutenberg' || i.builder === 'classic';
    return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: 0, newValue: { action: 'add_h1', text }, status: ok ? 'draft' : 'needs_human', reason: ok ? null : `Add the H1 “${text}” in ${i.builder ?? 'the page builder'}.` });
  }
  // More than one H1: H1s outside the content come from the theme; keep at most one in total.
  const theme = Math.max(0, liveH1 - i.h1s.length);
  if (!i.h1s.length) return push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: liveH1, newValue: null, status: 'needs_human', reason: 'The extra H1 comes from the theme or a template, not the page content.' });
  push(c, a, { type: 'heading_fix', target: target(i), url: i.url, label, before: liveH1, newValue: { action: 'demote_extra_h1', keep: theme ? 0 : 1 }, status: 'draft', reason: `${liveH1} H1s on the page; the ${theme ? 'theme’s stays and the ones in the content' : 'first stays and the others'} become H2s.`, week: 1 });
  if (!theme) c.h1Text.push({ a, page: i, after: c.items[c.items.length - 1]?.id ?? null });
}

/** The main H1's words: they should say what the page is about (its page-plan keyword). */
async function h1TextItems(c: Ctx) {
  type Job = { a: ActionItem | null; page: InventoryItem; after: string | null; current: string; keyword: string; draft: string | null; problems: string[] };
  const jobs: Job[] = [];
  for (const j of c.h1Text) {
    const live = j.page.url ? c.live.get(pageKey(j.page.url)) : undefined;
    const current = j.current ?? j.page.h1s[0] ?? live?.headings.find((h) => h.level === 1)?.text ?? null;
    const keyword = c.input.keywords.get(pageKey(j.page.url ?? '')) ?? null;
    const label = `Main heading (H1) words · ${nameOf(j.page)}`;
    if (!current || !keyword) continue;
    const ctx = { mainKeyword: keyword, profile: c.input.profile, title: live?.title ?? null };
    // KEEP rule: a heading that already passes stays.
    if (!checkH1(current, ctx).length) {
      push(c, j.a, { type: 'heading_fix', target: target(j.page), url: j.page.url, label, before: current, newValue: null, status: 'keep', reason: `Already says what the page is about (“${keyword}”).` });
      continue;
    }
    if (!j.page.h1s.length) {
      push(c, j.a, { type: 'heading_fix', target: target(j.page), url: j.page.url, label, before: current, newValue: null, status: 'needs_human', reason: `The H1 “${current}” comes from the theme (usually the page title). Change the page title so it says what the page is about: “${keyword}”.` });
      continue;
    }
    const planned = c.input.h1Drafts?.get(pageKey(j.page.url ?? '')) ?? null;
    jobs.push({ ...j, current, keyword, draft: planned, problems: planned ? checkH1(planned, ctx) : ['no draft yet'] });
  }
  for (let round = 0; round < 2 && c.input.ai; round++) {
    const ask = jobs.filter((j) => j.problems.length);
    if (!ask.length) break;
    try {
      const r = await draftH1(c.input.ai, ask.map((j) => {
        const live = c.live.get(pageKey(j.page.url ?? ''));
        return { url: j.page.url!, name: nameOf(j.page), mainKeyword: j.keyword, currentH1: j.current, title: live?.title ?? null, excerpt: live?.text ?? '', problems: j.draft ? j.problems : [] };
      }), c.input.profile);
      c.tokens += r.tokens;
      for (const j of ask) {
        const d = r.drafts.get(j.page.url!);
        if (d) {
          j.draft = d;
          j.problems = checkH1(d, { mainKeyword: j.keyword, profile: c.input.profile, title: c.live.get(pageKey(j.page.url ?? ''))?.title ?? null });
        }
      }
    } catch (err) {
      c.notes.push(`Drafting headings failed: ${err instanceof Error ? err.message.slice(0, 120) : 'model error'}`);
      break;
    }
  }
  for (const j of jobs) {
    // Without a model or a page-plan draft: the keyword itself, in title case (and the place, when it is not in the keyword).
    if (!j.draft) {
      const place = c.input.profile.places[0];
      const kw = j.keyword.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
      j.draft = place && !j.keyword.toLowerCase().includes(place.toLowerCase()) ? `${kw} in ${place}` : kw;
      j.problems = checkH1(j.draft, { mainKeyword: j.keyword, profile: c.input.profile });
    }
    const label = `Main heading (H1) words · ${nameOf(j.page)}`;
    const ok = !j.problems.length && ['gutenberg', 'classic', 'bricks', 'elementor'].includes(j.page.builder ?? 'classic');
    push(c, j.a, {
      type: 'heading_fix', target: target(j.page), url: j.page.url, label, before: j.current, newValue: { action: 'set_h1_text', text: j.draft }, status: ok ? 'draft' : 'needs_human',
      reason: ok ? `The H1 does not say what the page is about (main keyword “${j.keyword}”).` : j.problems.length ? `Draft did not pass the rules: ${j.problems.join('; ')}` : `Change the H1 to “${j.draft}” in ${j.page.builder ?? 'the editor'}.`,
      week: 1,
    });
    const it = c.items[c.items.length - 1]!;
    if (j.after) it.dependsOn = [j.after];
  }
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

/** Page builders the plugin (1.4.0+) can add a section to. Others (Divi…) need a person. */
const SECTION_BUILDERS = ['gutenberg', 'classic', 'bricks', 'elementor'];
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slugOf = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const wordsOf = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'for', 'new', 'page', 'create', 'add', 'build', 'with', 'about', 'our'].includes(w)));

function sectionHtml(s: DraftedSection): string {
  const table = s.table.headers.length && s.table.rows.length
    ? `<table><thead><tr>${s.table.headers.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '';
  const list = s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
  return `<h2>${esc(s.heading)}</h2>${s.paragraphs.map((x) => `<p>${esc(x)}</p>`).join('')}${list}${table}`;
}
const sectionText = (s: DraftedSection) => [s.heading, ...s.paragraphs, ...s.bullets, ...s.table.headers, ...s.table.rows.flat()].join(' ');

/** Real reviews only: a testimonials/reviews section is never written by the model. */
const NEEDS_REAL = /\b(testimonials?|reviews?|case stud(?:y|ies)|client stories|success stories)\b/i;

/** A new section on each target page (what the task asks for), drafted from facts on that page. */
async function sectionItems(c: Ctx, a: ActionItem, kind: 'section' | 'comparison_table', pages: InventoryItem[]) {
  const task = `${a.title}. ${a.plan?.change ?? ''}`.trim();
  for (const i of pages.slice(0, 3)) {
    const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
    const label = `${kind === 'comparison_table' ? 'Comparison table' : 'New section'} · ${nameOf(i)}`;
    const blockId = `${kind === 'comparison_table' ? 'table' : 'section'}-${slugOf(a.title).slice(0, 30)}`;
    if (NEEDS_REAL.test(task)) {
      push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: null, status: 'needs_human', reason: 'Testimonials, reviews and case studies must be real: send us the client quotes (or connect Google Business Profile) and the section is added from them. The autopilot never writes them itself.' });
      continue;
    }
    if (!pluginBuilds(c, i.builder)) {
      push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: null, status: 'needs_human', reason: `Update the MS SCORE Connector plugin to 1.4.0 or later: it adds sections on ${i.builder} pages.` });
      continue;
    }
    let section: DraftedSection | null = null;
    let problems: string[] = [c.input.ai ? 'no draft yet' : 'no AI drafting set up (OpenAI)'];
    const source = `${live?.text ?? ''} ${(c.input.profile.services ?? []).join(' ')}`;
    for (let round = 0; round < 2 && c.input.ai && problems.length; round++) {
      try {
        const r = await draftSection(c.input.ai, { task, kind, url: i.url ?? '', name: nameOf(i), mainKeyword: c.input.keywords.get(pageKey(i.url ?? '')) ?? null, text: live?.text ?? '', problems: round ? problems : [] }, c.input.profile);
        c.tokens += r.tokens;
        section = r.section;
        problems = [
          ...checkBlock(sectionText(section), { kind: 'section', profile: c.input.profile, sourceText: source }),
          ...(kind === 'comparison_table' && !section.table.rows.length ? ['the comparison table is empty'] : []),
        ];
      } catch (err) {
        c.notes.push(`Drafting the ${label} failed: ${err instanceof Error ? err.message.slice(0, 120) : 'model error'}`);
        break;
      }
    }
    const value = section ? { block_id: blockId, kind: kind === 'comparison_table' ? 'table' : 'section', position: 'end', html: sectionHtml(section) } : null;
    if (problems.length || !value) push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: value, status: 'needs_human', reason: `Draft did not pass the rules: ${problems.join('; ')}` });
    else if (!SECTION_BUILDERS.includes(i.builder ?? '')) push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: value, status: 'needs_human', reason: `This page is built with ${i.builder}; paste the drafted section in the page builder.` });
    else push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: value, status: 'draft' });
  }
}

function pageHtml(p: DraftedPage): string {
  return `<p>${esc(p.intro)}</p>${p.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.paragraphs.map((x) => `<p>${esc(x)}</p>`).join('')}${s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}`).join('')}`;
}

/** The page-plan page a "create a page" task is about: the best word match with the task. */
function pageSpecFor(c: Ctx, a: ActionItem): NewPageSpec | null {
  const specs = c.input.newPages ?? [];
  const task = wordsOf(`${a.title} ${a.plan?.change ?? ''} ${(a.plan?.keywords ?? []).join(' ')}`);
  let best: { s: NewPageSpec; score: number } | null = null;
  for (const s of specs) {
    const kw = wordsOf(`${s.mainKeyword} ${s.path.replace(/[/-]/g, ' ')}`);
    const hit = [...kw].filter((w) => task.has(w)).length / Math.max(1, kw.size);
    if (hit >= 0.6 && (!best || hit > best.score)) best = { s, score: hit };
  }
  return best?.s ?? null;
}

/** "Create a new page" tasks: the page drafted from the page plan and saved as a WordPress draft. */
async function pageItems(c: Ctx, a: ActionItem) {
  const spec = pageSpecFor(c, a);
  const label = `New page · ${a.title}`;
  if (!spec) {
    push(c, a, { type: 'manual', target: null, url: null, label, before: null, newValue: null, status: 'needs_human', reason: 'The page plan has no new page that matches this task, so it is not clear what the page is about. Add it to the page plan (Keywords → Page plan) and run again.' });
    return;
  }
  const path = spec.path.replace(/^\/+|\/+$/g, '');
  const parts = path.split('/');
  const slug = parts.pop() || slugOf(spec.mainKeyword);
  const exists = c.input.inventory.items.some((i) => i.url && new URL(i.url).pathname.replace(/^\/+|\/+$/g, '').endsWith(path));
  if (exists) {
    push(c, a, { type: 'create_page', target: { site: true }, url: null, label, before: null, newValue: null, status: 'keep', reason: `A page at /${path}/ already exists.` });
    return;
  }
  if (!pluginBuilds(c, 'bricks')) {
    push(c, a, { type: 'create_page', target: { site: true }, url: null, label: `New page · /${path}/`, before: null, newValue: null, status: 'needs_human', reason: 'Update the MS SCORE Connector plugin to 1.4.0 or later: it creates new pages as drafts.' });
    return;
  }
  const siteText = [...c.live.values()].map((p) => p.text ?? '').join(' ').slice(0, 6000);
  const suffix = autoSuffix(c);
  let page: DraftedPage | null = null;
  let problems: string[] = [c.input.ai ? 'no draft yet' : 'no AI drafting set up (OpenAI)'];
  for (let round = 0; round < 2 && c.input.ai && problems.length; round++) {
    try {
      const r = await draftPage(c.input.ai, { task: `${a.title}. ${a.plan?.change ?? ''}`.trim(), mainKeyword: spec.mainKeyword, secondary: spec.secondary, questions: spec.questions, pageType: spec.pageType, siteText, suffix, problems: round ? problems : [] }, c.input.profile);
      c.tokens += r.tokens;
      page = r.page;
      const body = [page.intro, ...page.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...s.bullets])].join(' ');
      const n = body.split(/\s+/).filter(Boolean).length;
      problems = [
        ...(n < 300 ? [`the page has ${n} words (needs at least 300)`] : []),
        ...(page.sections.length < 3 ? ['fewer than 3 sections'] : []),
        ...(page.metaTitle.length < 45 || page.metaTitle.length > 65 ? [`meta title has ${page.metaTitle.length} characters (needs 50–60)`] : []),
        ...(page.metaDescription.length < 130 || page.metaDescription.length > 160 ? [`meta description has ${page.metaDescription.length} characters (needs 140–155)`] : []),
        ...checkH1(page.h1, { mainKeyword: spec.mainKeyword, profile: c.input.profile }),
        ...checkBlock(body, { kind: 'table', profile: c.input.profile, sourceText: `${siteText} ${(c.input.profile.services ?? []).join(' ')}` }),
      ];
    } catch (err) {
      c.notes.push(`Drafting the ${label} failed: ${err instanceof Error ? err.message.slice(0, 120) : 'model error'}`);
      break;
    }
  }
  const value = page ? { title: page.h1, slug, parent_path: parts.join('/'), html: pageHtml(page), meta_title: page.metaTitle, meta_description: page.metaDescription, faq: page.faq.slice(0, 5) } : null;
  push(c, a, {
    type: 'create_page', target: { site: true }, url: null, label: `New page · /${path}/`, before: null, newValue: value,
    status: problems.length || !value ? 'needs_human' : 'draft',
    reason: problems.length || !value ? `Draft did not pass the rules: ${problems.join('; ')}` : 'Saved in WordPress as a draft: read it and press Publish.',
  });
}

async function blockItems(c: Ctx, a: ActionItem, kind: 'answer' | 'faq', pages: InventoryItem[]) {
  for (const i of pages.slice(0, 5)) {
    const live = i.url ? c.live.get(pageKey(i.url)) : undefined;
    const label = `${kind === 'answer' ? 'Direct answer' : 'FAQ'} · ${nameOf(i)}`;
    const editable = SECTION_BUILDERS.includes(i.builder ?? '');
    if (kind === 'faq' && live?.faqMarkup) {
      push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: 'FAQ', newValue: null, status: 'keep', reason: 'The page already has an FAQ.' });
      continue;
    }
    const opening = (live?.firstParagraph ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (kind === 'answer' && opening >= 40 && opening <= 80) {
      push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: live!.firstParagraph, newValue: null, status: 'keep', reason: 'The page already opens with a direct answer of 40–80 words.' });
      continue;
    }
    if (!pluginBuilds(c, i.builder)) {
      push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: null, status: 'needs_human', reason: `Update the MS SCORE Connector plugin to 1.4.0 or later: it adds sections on ${i.builder} pages.` });
      continue;
    }
    let answer = '';
    let faq: { q: string; a: string }[] = [];
    let problems: string[] = ['no draft yet'];
    let fromPage = false;
    const source = `${live?.text ?? ''} ${live?.description ?? ''} ${c.input.profile.places.join(' ')}`;
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
    // No AI draft that passes (or no AI set up): the answer is built from the page's own sentences.
    if (kind === 'answer' && problems.length && live) {
      const own = answerFromPage(live);
      if (own && !checkBlock(own, { kind: 'answer', profile: c.input.profile, sourceText: source }).length) {
        answer = own;
        problems = [];
        fromPage = true;
      }
    }
    const value = kind === 'answer'
      ? { block_id: `answer-${i.id}`, kind, position: 'after_h1', html: `<p>${answer.replace(/</g, '&lt;')}</p>` }
      : { block_id: `faq-${i.id}`, kind, position: 'end', faq };
    if (problems.length) push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: answer || faq.length ? value : null, status: 'needs_human', reason: `Draft did not pass the rules: ${problems.join('; ')}` });
    else if (!editable) push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: value, status: 'needs_human', reason: `This page is built with ${i.builder}; paste the drafted ${kind === 'answer' ? 'answer' : 'FAQ'} in the page builder.` });
    else push(c, a, { type: 'content_block', target: target(i), url: i.url, label, before: null, newValue: value, status: 'draft', reason: fromPage ? 'Written from sentences already on the page (no AI draft passed the rules).' : null });
  }
}

/** The connected plugin is version major.minor.patch or later. */
function pluginAtLeast(c: Ctx, major: number, minor: number, patch = 0): boolean {
  const [x = 0, y = 0, z = 0] = String(c.input.inventory.status?.version ?? '0').split('.').map((n) => Number.parseInt(n, 10) || 0);
  return x !== major ? x > major : y !== minor ? y > minor : z >= patch;
}

/** Page builders the plugin can add sections to need plugin 1.4.0; Gutenberg and Classic work from 1.2.0. */
function pluginBuilds(c: Ctx, builder: string | null | undefined): boolean {
  if (builder !== 'bricks' && builder !== 'elementor') return true;
  return pluginAtLeast(c, 1, 4);
}

/**
 * A direct answer made only of the page's own sentences (its meta description and opening text):
 * whole sentences of 8+ words, no repeats, until 40–80 words. Null when the page has too little.
 */
export function answerFromPage(p: Pick<PageContent, 'description' | 'firstParagraph' | 'text' | 'headings'>): string | null {
  const heads = new Set((p.headings ?? []).map((h) => h.text.trim().toLowerCase()));
  const sentences = [p.description ?? '', p.firstParagraph ?? '', (p.text ?? '').slice(0, 4000)]
    .join(' ')
    .replace(/\s+/g, ' ')
    .match(/[A-Z][^.!?]{20,400}[.!?](?=\s|$)/g) ?? [];
  const out: string[] = [];
  const chosen: Set<string>[] = [];
  const bag = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2));
  // Mostly the same words as a sentence already taken (the meta description often repeats the opening line).
  const repeats = (b: Set<string>) => chosen.some((c) => [...b].filter((x) => c.has(x)).length / Math.max(1, Math.min(b.size, c.size)) >= 0.6);
  let n = 0;
  for (const raw of sentences) {
    const t = raw.trim();
    const w = t.split(' ').length;
    const b = bag(t);
    // Page furniture is left out: labels run together ("SRMWhere"), interface words, cookie notices.
    const furniture = /[a-z][A-Z]/.test(t) || /\b(click|tap|hover|scroll|select a|menu|cookie|subscribe|copyright|all rights|read more|learn more|more about)\b/i.test(t);
    if (w < 8 || repeats(b) || heads.has(t.toLowerCase()) || furniture) continue;
    if (n + w > 80) continue;
    chosen.push(b);
    out.push(t);
    n += w;
    if (n >= 40) break;
  }
  return n >= 40 ? out.join(' ') : null;
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
  if (by === 'msscore') push(c, c.fileTask.sitemap ?? null, { type: 'sitemap', target: { site: true }, url: st.sitemap.url, label: 'XML sitemap', before: { enabled: true }, newValue: null, status: 'keep', reason: 'MS SCORE’s sitemap is on and updates itself when pages change.' });
  else if (st.seo_plugin !== 'none' && by !== 'none' && by !== 'wordpress') push(c, c.fileTask.sitemap ?? null, { type: 'sitemap', target: { site: true }, url: st.sitemap.url, label: 'XML sitemap', before: by, newValue: null, status: 'keep', reason: `${by} already makes the sitemap.` });
  else push(c, c.fileTask.sitemap ?? null, { type: 'sitemap', target: { site: true }, url: st.home_url.replace(/\/+$/, '') + '/sitemap.xml', label: by === 'wordpress' ? 'XML sitemap (replace WordPress’s basic one)' : 'Create the XML sitemap', before: { enabled: false, by, url: st.sitemap.url }, newValue: { enabled: true }, status: 'draft', reason: by === 'wordpress' ? 'WordPress’s own sitemap lists noindex pages and has no images or dates; MS SCORE’s leaves them out and updates itself.' : 'The site has no sitemap, so Google has no list of its pages.', priorityBoost: 20, week: 1 });

  // Resubmitted every month (and after the sitemap changes), even when no task asks for it.
  const sm = sitemapUrl(c.input.inventory);
  if (sm && !c.items.some((i) => i.type === 'gsc_sitemap_submit')) push(c, null, { type: 'gsc_sitemap_submit', target: null, url: sm, label: 'Submit the sitemap to Search Console', before: null, newValue: { sitemap: sm, month: c.now.slice(0, 7) }, status: 'draft', week: 1 });

  const robots = c.input.robotsTxt;
  const want = sitemapUrl(c.input.inventory);
  const lines = robots ? [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!) : [];
  const named = want ? lines.some((l) => pageKey(l) === pageKey(want)) : lines.length > 0;
  // WordPress in a folder (example.com/shop/) cannot change robots.txt: search engines only read it at the domain root.
  const inFolder = (() => {
    try {
      return new URL(st.home_url).pathname.replace(/\/+$/, '') !== '';
    } catch {
      return false;
    }
  })();
  const label = lines.length ? 'robots.txt: point to the new sitemap' : 'robots.txt: name the sitemap';
  const why = lines.length ? `robots.txt names ${lines.join(', ')}, not the sitemap search engines should read (${want}).` : 'robots.txt does not tell search engines where the sitemap is.';
  if (ext.robots_managed) push(c, c.fileTask.robots_txt ?? null, { type: 'robots_txt', target: { site: true }, url: st.home_url, label: 'robots.txt', before: true, newValue: null, status: 'keep', reason: 'MS SCORE already manages robots.txt.' });
  else if (robots === undefined || named) {
    if (robots !== undefined) push(c, c.fileTask.robots_txt ?? null, { type: 'robots_txt', target: { site: true }, url: st.home_url, label: 'robots.txt', before: robots, newValue: null, status: 'keep', reason: 'robots.txt already names the sitemap.' });
  } else if (inFolder && want) {
    const root = new URL(st.home_url).origin;
    push(c, c.fileTask.robots_txt ?? null, { type: 'robots_txt', target: { site: true }, url: `${root}/robots.txt`, label, before: robots, newValue: { line: `Sitemap: ${want}` }, status: 'needs_human', reason: `${why} WordPress runs in a folder and search engines only read ${root}/robots.txt, so change it where that file is kept (the file on the server or the website at the domain root): ${lines.length ? `replace the Sitemap line with` : 'add the line'} “Sitemap: ${want}”.`, week: 1 });
  } else push(c, c.fileTask.robots_txt ?? null, { type: 'robots_txt', target: { site: true }, url: st.home_url, label, before: robots, newValue: { enabled: true }, status: 'draft', reason: why, week: 1 });

  if (st.llms_file) push(c, c.fileTask.llms_txt ?? null, { type: 'llms_txt', target: { site: true }, url: null, label: 'llms.txt for AI assistants', before: 'file', newValue: null, status: 'keep', reason: 'The site has its own llms.txt file.' });
  else push(c, c.fileTask.llms_txt ?? null, { type: 'llms_txt', target: { site: true }, url: st.home_url, label: ext.llms_served ? 'llms.txt for AI assistants (monthly refresh)' : 'llms.txt for AI assistants', before: null, newValue: { content: llmsText(c.input.profile, c.input.inventory, c.input.now) }, status: 'draft', week: 2 });
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
    h1Text: [],
    fileTask: {},
  };
  const meta: { a: ActionItem; field: 'title' | 'description'; page: InventoryItem }[] = [];
  let redirectsDone = false;
  for (const a of input.actions.filter((x) => x.status !== 'dismissed' && x.status !== 'done' && x.status !== 'verified')) {
    const doer = a.plan?.doer;
    // The task's action type (plan executor); older tasks are mapped here when they have none yet.
    const exec = a.exec ?? { ...taskExec(a), targets: [] };
    const pages = pagesOf(c, a);
    const person = (reason: string, status?: WorkItemStatus) => push(c, a, { type: 'manual', target: null, url: pages[0]?.url ?? null, label: a.title, before: null, newValue: null, status: status ?? (exec.manualFor ?? (doer === 'client' ? 'client' : doer === 'developer' ? 'developer' : 'team')), reason });
    const needsTargets = (what: string) => push(c, a, { type: 'manual', target: null, url: null, label: a.title, before: null, newValue: null, status: 'needs_human', reason: `The task does not say which pages; choose the pages for “${what}” (or re-write the plan).` });
    switch (exec.actionType) {
      case 'tool':
        if (exec.tool === 'sitemap_submit') push(c, a, { type: 'gsc_sitemap_submit', target: null, url: sitemapUrl(input.inventory), label: 'Submit the sitemap to Search Console', before: null, newValue: { sitemap: sitemapUrl(input.inventory), month: c.now.slice(0, 7) }, status: 'draft', week: 1 });
        else if (exec.tool === 'ai_check') push(c, a, { type: 'ai_visibility_check', target: null, url: null, label: a.title, before: null, newValue: null, status: 'draft' });
        else push(c, a, { type: 'weekly_page_check', target: null, url: null, label: 'Check new and changed pages every week', before: null, newValue: null, status: 'draft' });
        break;
      case 'meta_title':
      case 'meta_description':
        if (!pages.length) needsTargets(exec.actionType === 'meta_title' ? 'new titles' : 'new descriptions');
        for (const p of pages) meta.push({ a, field: exec.actionType === 'meta_title' ? 'title' : 'description', page: p });
        break;
      case 'heading_fix':
        for (const p of pages.length ? pages : input.inventory.items.filter((i) => i.isFrontPage)) h1Item(c, a, p);
        break;
      case 'canonical':
        if (!pages.length) needsTargets('canonical tags');
        for (const p of pages) canonicalItem(c, a, p);
        break;
      case 'schema':
        for (const p of pages.length ? pages : input.inventory.items.filter((i) => i.isFrontPage)) schemaItems(c, a, p);
        break;
      case 'image_alt':
        await altItems(c, a, pages.length ? pages : input.inventory.items.filter((i) => i.isFrontPage));
        break;
      case 'content_block':
        if (exec.block === 'direct_answer' || exec.block === 'faq') await blockItems(c, a, exec.block === 'faq' ? 'faq' : 'answer', pages.length ? pages : input.inventory.items.filter((i) => i.isFrontPage));
        else await sectionItems(c, a, exec.block === 'comparison_table' ? 'comparison_table' : 'section', pages.length ? pages : input.inventory.items.filter((i) => i.isFrontPage));
        break;
      case 'create_page':
        await pageItems(c, a);
        break;
      case 'redirect_301':
        redirectItems(c, a);
        redirectsDone = true;
        break;
      case 'sitemap':
      case 'robots_txt':
      case 'llms_txt':
        c.fileTask[exec.actionType] = a;
        break;
      case 'robots_noindex':
        if (!pages.length) needsTargets('pages to hide from Google');
        for (const p of pages) {
          const live = p.url ? c.live.get(pageKey(p.url)) : undefined;
          if (p.isFrontPage) push(c, a, { type: 'robots_noindex', target: target(p), url: p.url, label: `Hide from Google · ${nameOf(p)}`, before: null, newValue: null, status: 'needs_human', reason: 'The homepage is never hidden from Google automatically.' });
          else push(c, a, { type: 'robots_noindex', target: target(p), url: p.url, label: `Hide from Google · ${nameOf(p)}`, before: p.noindex ? 'noindex' : 'index', newValue: p.noindex ? null : 'noindex', status: p.noindex ? 'keep' : 'draft', reason: p.noindex ? 'Already hidden from Google.' : live ? null : 'The live page could not be read.' });
        }
        break;
      case 'og_tags':
        for (const p of pages.length ? pages : input.inventory.items.filter((i) => i.isFrontPage)) {
          const live = p.url ? c.live.get(pageKey(p.url)) : undefined;
          const ok = live?.openGraph?.title && live.openGraph.description;
          push(c, a, { type: 'og_tags', target: target(p), url: p.url, label: `Social sharing tags · ${nameOf(p)}`, before: null, newValue: ok ? null : { title: decode(live?.title), description: decode(live?.description) }, status: ok ? 'keep' : 'draft', reason: ok ? 'Open Graph title and description are already there.' : null });
        }
        break;
      case 'internal_link':
        person(`Internal links need the words to link and the page to link to; a person adds them for now: ${a.plan?.change || a.title}`, 'needs_human');
        break;
      case 'product_copy':
        person(`Product descriptions are written by a person: ${a.plan?.change || a.title}`, 'needs_human');
        break;
      default:
        person('Not a change the plugin makes.');
    }
  }
  await metaItems(c, meta);
  // Every page gets one H1 that says what it is about, whether or not this month's plan has an H1 task.
  const h1Done = new Set(c.items.filter((i) => i.type === 'heading_fix').map((i) => pageKey(i.url ?? '')));
  for (const p of input.inventory.items.filter((i) => i.url && !i.noindex && ['page', 'post', 'product'].includes(i.type) && c.live.has(pageKey(i.url!)) && !h1Done.has(pageKey(i.url!)))) h1Item(c, null, p);
  await h1TextItems(c);
  siteFileItems(c);
  // Dead addresses are fixed in week 1 even when no task mentions redirects.
  if (!redirectsDone && input.deadUrls.length) redirectItems(c, null);
  // Canonicals first, then titles/descriptions/H1s on the same page (the plan's rule).
  for (const it of c.items) {
    if (['meta_title', 'meta_description', 'heading_fix'].includes(it.type) && it.status === 'draft') {
      it.dependsOn = [...new Set([...it.dependsOn, ...c.items.filter((x) => x.type === 'canonical' && x.status === 'draft' && x.url && it.url && pageKey(x.url) === pageKey(it.url)).map((x) => x.id)])];
    }
  }
  c.items.sort((x, y) => y.priority - x.priority || x.week - y.week);
  return { items: c.items, tokens: c.tokens, notes: c.notes };
}
