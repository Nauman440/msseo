import { describe, expect, it } from 'vitest';
import { actionTexts, emptyActions, emptyKeywordWorkspace, INTERNAL_GROUP_TERMS, ownerGroupOf, ownerText, pageNameOf, siteWideTitle, writeAiPlan, type OpenAiClient, type ReportModel } from '../src';

const page = (path: string, title: string, o: Record<string, unknown> = {}) => ({
  url: `https://maxbox.uk${path}`, title, h1: title, words: 400, pageType: 'other', schemaTypes: [], links: [], description: null, h1Count: 1,
  canonical: null, noindex: false, images: 1, imagesNoAlt: 1, openGraph: { title: false, description: true, image: true }, ...o,
});
const products = Array.from({ length: 6 }, (_, i) => page(`/products/dog-chew-${i + 1}/`, `Dog Chew ${i + 1} | Maxbox`, { schemaTypes: ['Product'] }));
const report = {
  id: 'audit-1', project: { name: 'Maxbox', domain: 'maxbox.uk' }, overall: { score: 70 }, pagesCrawled: 9, issues: [],
  robots: { found: true, rows: [], suggested: '' }, sitemap: { found: false, url: '', rows: [], segments: [] },
  pages: [page('/', 'Maxbox | Natural Pet Food', { pageType: 'home' }), page('/pages/about-us/', 'About Us | Maxbox', { pageType: 'about' }), page('/pages/contact/', 'Contact | Maxbox', { pageType: 'contact' }), ...products],
} as unknown as ReportModel;

// What the model wrote in the maxbox.uk plan: internal group names everywhere (bug report 2026-11-25).
const task = (id: string, o: Record<string, unknown>) => ({
  id, week: 2, title: 't', why: 'Fixes the money pages first.', change: 'Rewrite the information-page copy and the other pages.', urls: [], keywords: [], category: 'on_page', doer: 'team',
  site_wide_item: 'none', page_group: 'none', issue_ids: [], depends_on: [], success_check: 'Main pages pass.', check_after_days: 14, impact: 3, confidence: 3, effort: 2, ...o,
});
const answer = {
  summary: 'Start with the money pages.', baseline_and_targets: [], later: [], needs_developer: [], data_gaps: [], page_meta: [],
  months: [1, 2, 3, 4, 5, 6].map((m) => ({
    month: m, theme: `Main pages ${m}`, goal: 'Other pages fixed',
    tasks: m === 1
      ? [
        task('1.01', { title: 'Meta titles: information-page group', doer: 'approve', site_wide_item: 'meta_title', page_group: 'money_pages', urls: ['https://maxbox.uk/pages/about-us/', 'https://maxbox.uk/pages/contact/'] }),
        task('1.02', { title: 'Meta titles: money-page group', doer: 'approve', site_wide_item: 'meta_title', page_group: 'products', urls: products.map((p) => p.url) }),
        task('1.03', { title: 'Add a direct answer to /pages/about-us/', category: 'aeo', urls: ['https://maxbox.uk/pages/about-us/'] }),
      ]
      : [task(`${m}.01`, { title: 'Improve the main pages' })],
  })),
};
const client = {
  async generateJson(req: { name: string; user: string }) {
    if (req.name === 'page_meta_fix') return { data: { rows: [] }, tokens: 1, model: 'fake' };
    return { data: structuredClone(answer), tokens: 1, model: 'fake' };
  },
} as unknown as OpenAiClient;

describe('task titles name the pages (bug 8)', () => {
  it('names pages as the site does and groups them in owner words', () => {
    expect(pageNameOf({ url: 'https://maxbox.uk/pages/about-us/', title: 'About Us | Maxbox' }, ' | Maxbox')).toBe('About Us');
    expect(pageNameOf({ url: 'https://maxbox.uk/', title: 'Maxbox', pageType: 'home' })).toBe('Homepage');
    expect(pageNameOf({ url: 'https://maxbox.uk/blogs/news/puppy-food-guide', title: null, h1: null })).toBe('Puppy food guide');
    expect(ownerGroupOf({ url: 'https://maxbox.uk/collections/dog-food/', pageType: 'category' }, 'ecommerce')).toBe('Shop categories');
    expect(ownerGroupOf({ url: 'https://maxbox.uk/policies/refund-policy', pageType: 'other' })).toBe('Policy pages');
    expect(ownerGroupOf({ url: 'https://maxbox.uk/blogs/news/x', pageType: 'other' })).toBe('Blog posts');
    expect(ownerGroupOf({ url: 'https://maxbox.uk/pages/about-us/', pageType: 'about' })).toBe('Company pages');
    expect(siteWideTitle('meta_title', [{ name: 'About Us', group: 'Company pages' }, { name: 'Contact', group: 'Company pages' }])).toBe('New titles for About Us and Contact');
    expect(siteWideTitle('meta_title', Array.from({ length: 54 }, (_, i) => ({ name: `P${i}`, group: 'Product pages' as const })))).toBe('New titles for 54 product pages');
    expect(ownerText('Fix 2 other pages and the money pages')).not.toMatch(INTERNAL_GROUP_TERMS);
  });

  it('no task an owner reads contains an internal group name; each page is listed with before and after', async () => {
    let n = 0;
    const { workspace } = await writeAiPlan(client, emptyActions('maxbox.uk'), {
      domain: 'maxbox.uk', tier: 'growth', keywords: emptyKeywordWorkspace('maxbox.uk', { businessType: 'shop', seeds: { services: ['dog chews'] } }), mapping: null, report,
      start: new Date('2026-12-01T00:00:00Z'),
    }, { newId: () => `id${++n}`, now: new Date('2026-12-01T00:00:00Z'), report });
    const tasks = workspace.actions.filter((a) => a.plan);
    for (const a of tasks) for (const text of actionTexts(a)) expect(text, `task "${a.title}"`).not.toMatch(INTERNAL_GROUP_TERMS);
    for (const text of [workspace.aiPlan!.summary, ...workspace.aiPlan!.months.flatMap((m) => [m.theme, m.goal])]) expect(text).not.toMatch(INTERNAL_GROUP_TERMS);

    const titles = tasks.map((a) => a.title);
    expect(titles).toContain('New titles for About Us and Contact');
    expect(titles).toContain('New titles for 6 product pages');
    expect(titles).toContain('Add a direct answer to About Us');
    const productBatch = tasks.find((a) => a.title === 'New titles for 6 product pages')!;
    expect(productBatch.plan!.groupLabel).toBe('Product pages');
    expect(productBatch.plan!.pages).toHaveLength(6);
    expect(productBatch.plan!.pages![0]).toMatchObject({ name: 'Dog Chew 1', before: '“Dog Chew 1 | Maxbox” (19 characters)' });
    // Batches the code added from the crawl are named the same way.
    for (const a of tasks.filter((x) => x.plan!.siteWideItem && x.plan!.siteWideItem !== 'weekly_check')) {
      expect(a.title).not.toMatch(/: fix \d+/);
      expect(a.plan!.pages!.length).toBe(a.urls.length);
    }
  });
});
