import { describe, expect, it } from 'vitest';
import { applyOrder, runWorkItems, visibleIn, type WorkItem, type WpApplyResult, type WpChange, type WpRollbackResult } from '../src';

const site = 'https://shop.test';
const item = (id: string, o: Partial<WorkItem> = {}): WorkItem => ({
  id, accountId: 'acc', domain: 'shop.test', actionId: 'a1', taskId: null, type: 'meta_title', target: { post_id: 1 }, url: `${site}/`, label: id,
  before: 'Old', newValue: `Title ${id}`, status: 'draft', reason: null, priority: 30, month: 1, week: 1, dependsOn: [], createdAt: '', scheduledFor: null,
  appliedAt: null, verifiedAt: null, attempts: 0, ...o,
});

/** A fake site: applying a title changes the page's <title>; rollback restores it. */
function fakeSite(opts: { failIds?: string[]; breakAfterApply?: boolean; refuseRollback?: boolean; undoneBefore?: string[] } = {}) {
  let title = 'Old';
  let broken = false;
  const log: string[] = [];
  const applied = new Map<string, string>();
  return {
    log,
    wp: {
      async apply(c: WpChange): Promise<WpApplyResult> {
        log.push(`apply ${c.change_id}`);
        if (opts.failIds?.includes(c.change_id)) return { status: 'failed', reason: 'refused' };
        if (opts.undoneBefore?.includes(c.change_id)) return { status: 'rolled_back', change_id: c.change_id, repeat: true };
        applied.set(c.change_id, title);
        title = String(c.new_value);
        if (opts.breakAfterApply) broken = true;
        return { status: 'applied', change_id: c.change_id, before: 'Old', after: title };
      },
      async rollback(id: string): Promise<WpRollbackResult> {
        log.push(`rollback ${id}`);
        if (opts.refuseRollback) return { status: 'needs_human', reason: 'cannot' };
        title = applied.get(id) ?? title;
        broken = false;
        return { status: 'rolled_back', change_id: id };
      },
    },
    fetchPage: async () => ({ status: broken ? 500 : 200, html: broken ? '' : `<html><head><title>${title}</title></head><body>${'word '.repeat(300)}</body></html>`, location: null }),
  };
}

describe('runWorkItems', () => {
  it('makes a change again under a new id when the same change was undone before', async () => {
    const s = fakeSite({ undoneBefore: ['ms-sitemap0'] });
    const r = await runWorkItems([item('ms-sitemap0')], { wp: s.wp, fetchPage: s.fetchPage, wait: async () => undefined }, { keyPages: [`${site}/`], firstRun: false });
    const it0 = r.items[0]!;
    expect(it0.status).toBe('verified');
    expect(it0.changeId).toMatch(/^ms-sitemap0-r/);
    expect(s.log).toEqual(['apply ms-sitemap0', `apply ${it0.changeId}`]);
  });

  it('proves undo on the first run, then applies and verifies on the live page', async () => {
    const s = fakeSite();
    const r = await runWorkItems([item('t1')], { ...s, wait: async () => undefined }, { keyPages: [`${site}/`], firstRun: true });
    expect(s.log.map((l) => l.replace(/-t[0-9a-z]+$/, '-t'))).toEqual(['apply t1-t', 'rollback t1-t', 'apply t1']);
    expect(r.run).toMatchObject({ undoTested: true, applied: 1, verified: 1, paused: false });
    expect(r.items[0]).toMatchObject({ status: 'verified' });
  });

  it('stops before changing anything when undo does not work', async () => {
    const s = fakeSite({ refuseRollback: true });
    const r = await runWorkItems([item('t1'), item('t2')], { ...s, wait: async () => undefined }, { keyPages: [], firstRun: true });
    expect(r.run.paused).toBe(true);
    expect(s.log.map((l) => l.replace(/-t[0-9a-z]+$/, '-t'))).toEqual(['apply t1-t', 'rollback t1-t']);
  });

  it('pauses after 3 failed changes', async () => {
    const s = fakeSite({ failIds: ['a', 'b', 'c'] });
    const r = await runWorkItems(['a', 'b', 'c', 'd'].map((x) => item(x)), { ...s, wait: async () => undefined }, { keyPages: [], firstRun: false });
    expect(r.run).toMatchObject({ failed: 3, paused: true });
    expect(s.log).not.toContain('apply d');
  });

  it('undoes the whole run when a key page breaks', async () => {
    const s = fakeSite({ breakAfterApply: true });
    const r = await runWorkItems([item('x'), item('y')], { ...s, wait: async () => undefined }, { keyPages: [`${site}/`], firstRun: false });
    expect(r.run).toMatchObject({ rolledBack: true, paused: true });
    expect(r.items.every((i) => i.status === 'rolled_back')).toBe(true);
    expect(s.log.slice(-2)).toEqual(['rollback y', 'rollback x']);
  });

  it('respects the daily cap and applies dependencies first', () => {
    const items = [item('title', { dependsOn: ['canon'], priority: 50 }), item('canon', { type: 'canonical', priority: 10 }), item('kept', { status: 'keep' })];
    expect(applyOrder(items).map((i) => i.id)).toEqual(['canon', 'title']);
  });

  it('reads each change type on the live page', () => {
    expect(visibleIn(item('d', { type: 'meta_description', newValue: 'Fish & chips daily.' }), '<meta name="description" content="Fish &amp; chips daily.">')).toBe(true);
    expect(visibleIn(item('c', { type: 'canonical', newValue: `${site}/a/` }), `<link rel="canonical" href="${site}/a">`)).toBe(true);
    expect(visibleIn(item('r', { type: 'robots_noindex', newValue: 'noindex' }), "<meta name='robots' content='noindex, follow'>")).toBe(true);
    expect(visibleIn(item('r', { type: 'robots_noindex', newValue: 'noindex' }), '<meta name="robots" content="max-image-preview:large">')).toBe(false);
    expect(visibleIn(item('l', { type: 'internal_link', newValue: { link_id: 'L1' } }), '<a data-msscore-link="L1">x</a>')).toBe(true);
  });
});
