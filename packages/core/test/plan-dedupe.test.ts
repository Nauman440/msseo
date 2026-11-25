import { describe, expect, it } from 'vitest';
import { dedupeTasks, fixWording, orderChecks, tidyPlanTasks, type AiPlanTask } from '../src';

type T = AiPlanTask & { month: number };
const t = (id: string, month: number, title: string, o: Partial<T> = {}): T => ({
  id, month, week: 2, title, why: 'w', change: 'c', urls: [], keywords: [], category: 'technical', doer: 'team', impact: 3, confidence: 3, effort: 2, priority: 0,
  depends_on: [], success_check: 's', check_after_days: 14, site_wide_item: 'none', page_group: 'none', area: '', issue_ids: [], recurring: false, ...o,
});

// The duplicates in the maxbox.uk plan (bug report 2026-11-25).
describe('plan clean-up: duplicates, order and wording', () => {
  it('keeps one AI-visibility check a month', () => {
    const all = [t('1', 2, 'AI-visibility re-test (month 2)', { category: 'ai_visibility', recurring: true }), t('2', 2, 'Run the 2nd AI visibility check', { category: 'ai_visibility', week: 4 }), t('3', 2, 'Improve AI visibility: answer buyer questions', { category: 'ai_visibility' })];
    const notes: string[] = [];
    dedupeTasks(all, notes);
    expect(all.map((x) => x.id)).toEqual(['1', '3']);
    expect(notes[0]).toMatch(/one check a month/);
  });

  it('merges the same work planned twice into the earliest task, keeping pages and issues', () => {
    const all = [
      t('s2', 2, 'Turn on security settings', { issue_ids: ['1.10.3'] }), t('s3', 3, 'Add security headers (HSTS)'),
      t('m1', 1, 'Improve mobile speed'), t('m2', 2, 'Speed up mobile pages'), t('m3', 3, 'Fix Core Web Vitals on mobile'),
      t('f2', 2, 'Add an FAQ with FAQPage markup', { category: 'ai_visibility' }), t('f6', 6, 'FAQ sections on service pages', { category: 'ai_visibility' }),
      t('o1', 1, 'Organization schema with sameAs links'), t('o4', 4, 'Add Organization schema to the homepage'),
      t('c3', 3, 'Comparison table on /collections/dog-food/', { urls: ['https://maxbox.uk/collections/dog-food/'] }), t('c6', 6, 'Comparison tables for dog food', { urls: ['https://maxbox.uk/collections/dog-food'] }),
      t('d1', 1, 'Direct answer at the top of /', { urls: ['https://maxbox.uk/'] }), t('d2', 2, 'Direct answer at the top of /about/', { urls: ['https://maxbox.uk/about/'] }),
      t('i1', 1, 'Fix broken links', { issue_ids: ['1.12.5'] }), t('i4', 4, 'Broken links on blog pages', { issue_ids: ['1.12.5'], urls: ['https://maxbox.uk/blog/'] }),
      t('x', 5, 'Ask for reviews', { depends_on: ['m3', 's3'] }),
    ];
    const notes: string[] = [];
    dedupeTasks(all, notes);
    expect(all.map((x) => x.id)).toEqual(['s2', 'm1', 'f2', 'o1', 'c3', 'd1', 'd2', 'i1', 'x']);
    // Different pages stay separate tasks; the merged one keeps both tasks' pages.
    expect(all.find((x) => x.id === 'i1')!.urls).toEqual(['https://maxbox.uk/blog/']);
    // Dependencies on merged tasks point at the task that kept the work.
    expect(all.find((x) => x.id === 'x')!.depends_on).toEqual(['m1', 's2']);
  });

  it('checks of new articles come after the articles are written; checks of nothing are dropped', () => {
    const all = [
      t('a', 1, 'Check discovery of the first articles', { category: 'content' }),
      t('w', 3, 'Write the first two articles', { category: 'content', week: 3 }),
      t('p', 2, 'Verify the new pages are indexed'),
      t('r', 2, 'Review blog posts for outdated facts', { category: 'content' }),
    ];
    const notes: string[] = [];
    orderChecks(all, notes);
    expect(all.find((x) => x.id === 'a')).toMatchObject({ month: 3, week: 4, depends_on: ['w'] });
    expect(all.some((x) => x.id === 'p')).toBe(false);
    // A review of what the site already has is not a check of new content: it stays.
    expect(all.find((x) => x.id === 'r')).toMatchObject({ month: 2 });
  });

  it('no "final" before month 6, and breadcrumbs are markup only', () => {
    const all = [
      t('1', 2, 'Validate final title changes'), t('2', 6, 'Final re-audit and results'),
      t('3', 1, 'Add visible breadcrumbs to product pages', { change: 'Show breadcrumbs at the top and add BreadcrumbList schema.' }),
    ];
    fixWording(all);
    expect(all[0]!.title).toBe('Validate title changes');
    expect(all[1]!.title).toBe('Final re-audit and results');
    expect(all[2]!.title).toBe('Add breadcrumb markup to product pages');
    expect(all[2]!.change).toBe('Show breadcrumb markup at the top and add BreadcrumbList schema.');
  });

  it('runs all three together', () => {
    const all = [t('1', 1, 'AI-visibility baseline', { category: 'ai_visibility' }), t('2', 1, 'Run the first AI visibility check', { category: 'ai_visibility' })];
    const notes: string[] = [];
    tidyPlanTasks(all, notes);
    expect(all).toHaveLength(1);
  });
});
