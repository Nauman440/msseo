import type { ActionItem, PageChange } from '../actions/actions';
import { fetchPageContents, type PageContent } from '../audit/page-content';
import { normTerm } from '../keywords/clean';
import { pathOf } from '../mapping/mapping';
import type { ApplyRecord, ChangeResult, SiteAdapter } from './types';

/**
 * Applies an approved action's page changes to the connected site (spec §16.5), one change at a
 * time, keeping what was there before so everything can be undone. Changes a platform cannot make
 * safely (body copy, links inside content, schema) stay "do by hand".
 */

/** Change ids the tool can apply by itself; everything else is done by a person. */
export const AUTO_CHANGES = new Set(['title', 'meta', 'h1', 'retarget', 'brief']);
export const canApply = (c: PageChange) => AUTO_CHANGES.has(c.id) && (c.id !== 'retarget' || c.label === 'Merge');

const MANUAL_NOTE: Record<string, string> = {
  intro: 'Page copy is written by a person: edit the opening paragraph in the editor.',
  section: 'Page copy is written by a person: add the section in the editor.',
  faq: 'Page copy is written by a person: add the questions in the editor.',
  links: 'Links go inside the page text: add them in the editor.',
  schema: 'Structured data needs your business details: add it with your SEO plugin or theme.',
  retarget: 'Changing the other page’s keyword is a copy change: edit its title and H1 in the editor.',
};

export async function applyChanges(action: ActionItem, adapter: SiteAdapter, by: string, now = new Date()): Promise<ApplyRecord> {
  const results: ChangeResult[] = [];
  const page = action.urls[0] ?? null;
  const target = page ? await adapter.find(page).catch(() => null) : null;
  for (const c of action.changes ?? []) {
    if (!canApply(c)) {
      results.push({ id: c.id, label: c.label, status: 'manual', note: MANUAL_NOTE[c.id] ?? 'Do this by hand.' });
      continue;
    }
    try {
      results.push(await applyOne(c, action, adapter, target, page));
    } catch (err) {
      results.push({ id: c.id, label: c.label, status: 'failed', note: err instanceof Error ? err.message.slice(0, 200) : 'Failed' });
    }
  }
  return { at: now.toISOString(), by: by.slice(0, 80), platform: adapter.platform, results };
}

async function applyOne(c: PageChange, action: ActionItem, adapter: SiteAdapter, target: Awaited<ReturnType<SiteAdapter['find']>>, page: string | null): Promise<ChangeResult> {
  const base = { id: c.id, label: c.label };
  if (c.id === 'brief') {
    const d = c.data ?? {};
    const draft = await adapter.createDraft({ path: d.path ?? '/new-page/', title: d.h1 ?? d.title ?? c.suggested, seoTitle: d.title ?? '', description: d.meta ?? '', html: d.html ?? '' });
    return { ...base, status: 'applied', note: 'Saved as a draft: review it, add the copy, then publish.', ref: draft.id, before: draft.editUrl };
  }
  if (c.id === 'retarget') {
    // Merge: redirect the competing pages to the main page (the content is moved by a person first).
    const [main, ...others] = action.urls;
    if (!main || !others.length) throw new Error('No pages to redirect.');
    const ids: string[] = [];
    for (const o of others) ids.push(await adapter.createRedirect(pathOf(o), pathOf(main)));
    return { ...base, status: 'applied', note: `Redirected ${others.map(pathOf).join(', ')} to ${pathOf(main)} (301).`, ref: ids.join(',') };
  }
  if (!page || !target) throw new Error(page ? `${pathOf(page)} was not found on the site.` : 'No page on this action.');
  // The value before the change is kept first, for undo.
  if (c.id === 'title') {
    const before = target.seoTitle ?? '';
    await adapter.setSeo(target, { title: c.suggested });
    return { ...base, status: 'applied', note: 'SEO title updated.', before, ref: target.id };
  }
  if (c.id === 'meta') {
    const before = target.seoDescription ?? '';
    await adapter.setSeo(target, { description: c.suggested });
    return { ...base, status: 'applied', note: 'Meta description updated.', before, ref: target.id };
  }
  const before = target.title;
  await adapter.setTitle(target, c.suggested);
  return { ...base, status: 'applied', note: 'Page title (H1) updated.', before, ref: target.id };
}

/** Puts back what was there before each applied change. */
export async function undoChanges(record: ApplyRecord, action: ActionItem, adapter: SiteAdapter, now = new Date()): Promise<ApplyRecord> {
  const page = action.urls[0] ?? null;
  const target = page ? await adapter.find(page).catch(() => null) : null;
  const results: ChangeResult[] = [];
  for (const r of record.results) {
    if (r.status !== 'applied') {
      results.push(r);
      continue;
    }
    try {
      if (r.id === 'brief' && r.ref) await adapter.deleteDraft(r.ref);
      else if (r.id === 'retarget' && r.ref) for (const id of r.ref.split(',')) await adapter.deleteRedirect(id);
      else if (target && r.id === 'title') await adapter.setSeo(target, { title: r.before ?? '' });
      else if (target && r.id === 'meta') await adapter.setSeo(target, { description: r.before ?? '' });
      else if (target && r.id === 'h1' && r.before) await adapter.setTitle(target, r.before);
      else throw new Error('The page was not found, so it could not be undone.');
      results.push({ ...r, status: 'undone', note: 'Put back as it was.' });
    } catch (err) {
      results.push({ ...r, note: `Undo failed: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown error'}` });
    }
  }
  return { ...record, results, undoneAt: now.toISOString() };
}

/** The live page as a visitor sees it (null when it cannot be loaded). */
export async function fetchLivePage(url: string): Promise<PageContent | null> {
  const [c] = await fetchPageContents([url]).catch(() => []);
  return c && c.status > 0 && c.status < 400 ? c : null;
}

/** After applying: does the live page show the new title, description and H1? (Caches can delay it.) */
export function checkVisible(record: ApplyRecord, action: ActionItem, live: PageContent | null): ApplyRecord {
  if (!live) return record;
  const has = (text: string | undefined, want: string) => Boolean(text) && normTerm(text!).includes(normTerm(want).slice(0, 60));
  const want = new Map((action.changes ?? []).map((c) => [c.id, c.suggested]));
  return {
    ...record,
    results: record.results.map((r) => {
      if (r.status !== 'applied' || !['title', 'meta', 'h1'].includes(r.id)) return r;
      const v = want.get(r.id) ?? '';
      const visible = r.id === 'title' ? has(live.title, v) : r.id === 'meta' ? has(live.description, v) : live.h1.some((h) => has(h, v));
      return { ...r, visible, note: visible ? `${r.note} Live on the page.` : `${r.note} Not visible yet: a cache, or the theme may show a different heading.` };
    }),
  };
}

/** HTML skeleton of a new page from its brief (headings and questions; the copy is written by a person). */
export function briefHtml(b: { h1: string; outline: string[]; faq: string[]; mustHave: string[] }): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<p>[Opening: 40 to 80 words that answer the search directly.]</p>',
    ...b.outline.map((h) => `<h2>${esc(h)}</h2>\n<p>[Write this section.]</p>`),
    ...(b.faq.length ? ['<h2>Frequently asked questions</h2>', ...b.faq.map((q) => `<h3>${esc(q)}</h3>\n<p>[Short direct answer.]</p>`)] : []),
    `<!-- Must have: ${esc(b.mustHave.join('; '))} -->`,
  ].join('\n');
}
