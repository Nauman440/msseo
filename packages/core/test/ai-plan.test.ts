import { describe, expect, it } from 'vitest';
import { AI_PLAN_JSON_SCHEMA, aiPlanSchema, applyAiPlan, buildPlanInput, checkPlan, emptyActions, emptyKeywordWorkspace, PLAN_CAPACITY, type AiPlan, type AiPlanTask, type ActionItem, cleanupPages, planExtrasFrom, topUpCandidates, type ReportPage } from '../src';

const t = (id: string, o: Partial<AiPlanTask> = {}): AiPlanTask => ({
  id, week: 1, title: `Task ${id}`, why: 'Because.', urls: ['https://shop.com/duvets/'], keywords: ['duvet covers'], change: 'Title A → Title B', category: 'on_page',
  doer: 'automatic', impact: 4, confidence: 4, effort: 2, priority: 0, depends_on: [], success_check: 'Clicks up', check_after_days: 14, site_wide_item: 'none', page_group: 'none', area: '', issue_ids: [], recurring: false, ...o,
});
const plan = (o: Partial<AiPlan> = {}): AiPlan => ({
  summary: 'S', baseline_and_targets: [], removed_keywords: [], page_map: [], later: [], data_gaps: [],
  months: [{ month: 1, theme: 'Fix', goal: 'G', tasks: [t('1.1')] }], ...o,
});
const shop = { businessType: 'ecommerce' as const, capacity: PLAN_CAPACITY.autopilot };

describe('AI action plan', () => {
  it('has a strict JSON schema that matches the zod parser', () => {
    expect(AI_PLAN_JSON_SCHEMA.required).toEqual(Object.keys(aiPlanSchema.shape));
    expect(aiPlanSchema.parse(plan())).toBeTruthy();
  });

  it('keeps each keyword on one page only', () => {
    const r = checkPlan(plan({
      page_map: [
        { url: '/duvets/', is_new: false, page_type: 'category', main_keyword: 'duvet covers', supporting_keywords: ['duvet cover', 'king duvet covers'], total_monthly_volume: 100 },
        { url: '/king/', is_new: false, page_type: 'category', main_keyword: 'king duvet covers', supporting_keywords: [], total_monthly_volume: 50 },
        { url: '/x/', is_new: true, page_type: 'category', main_keyword: 'Duvet Covers', supporting_keywords: [], total_monthly_volume: 10 },
      ],
    }), shop);
    // "duvet cover" is a plural variant of the main keyword, "king duvet covers" now belongs to /duvets/, so /king/ and /x/ lose theirs.
    expect(r.plan.page_map.map((p) => [p.url, p.main_keyword, p.supporting_keywords])).toEqual([['/duvets/', 'duvet covers', ['king duvet covers']]]);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('drops service-only checks for a shop, moves blockers to month 1 and scores tasks', () => {
    const r = checkPlan(plan({
      months: [
        { month: 1, theme: 'A', goal: 'a', tasks: [t('1.1', { impact: 9, effort: 0 })] },
        { month: 3, theme: 'B', goal: 'b', tasks: [t('3.1', { title: 'Show your licence and insurance' }), t('3.2', { title: 'Remove noindex from category pages', category: 'technical', doer: 'team', week: 3, depends_on: ['1.1'] })] },
      ],
    }), shop);
    const m1 = r.plan.months[0]!.tasks;
    // Ordered by week: the blocker moves from month 3 week 3 to month 1 week 2; its dependency keeps pointing at the renamed task.
    // The weekly check of new and changed pages (rule 23) is always added, last in month 1.
    expect(m1.map((x) => x.title)).toEqual(['Task 1.1', 'Remove noindex from category pages', 'Check new and changed pages every week']);
    expect(m1[0]).toMatchObject({ impact: 5, effort: 1, priority: 20, id: '1.01' });
    expect(m1[1]).toMatchObject({ week: 2, id: '1.02', depends_on: ['1.01'] });
    expect(r.plan.months[2]!.tasks).toEqual([]);
    expect(r.notes.join(' ')).toMatch(/online shop/);
  });

  it('never goes over the monthly capacity: the rest goes to "later"', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => t(`1.${i + 1}`, { impact: (i % 5) + 1 }));
    const r = checkPlan(plan({ months: [{ month: 1, theme: '', goal: '', tasks }] }), shop);
    // The weekly check does not count towards the capacity.
    expect(r.plan.months[0]!.tasks.filter((x) => x.site_wide_item === 'none')).toHaveLength(PLAN_CAPACITY.autopilot.automatic);
    expect(r.plan.later).toHaveLength(5);
    expect(Math.min(...r.plan.months[0]!.tasks.map((x) => x.impact))).toBeGreaterThanOrEqual(Math.max(...r.plan.later.map(() => 1)));
  });

  it('turns tasks into actions and keeps what a person already started', () => {
    let n = 0;
    const newId = () => `id${++n}`;
    const started: ActionItem = {
      id: 'old', source: { kind: 'audit', ruleId: '1.5.1' }, title: 'Fix 404s', detail: '', severity: 'high', impact: 4, confidence: 4, effort: 2, priority: 8, urls: [],
      owner: null, dueDate: null, approval: 'none', approvedAt: null, approvedBy: null, status: 'in_progress', bucket: 'd30', bucketLocked: false, before: null, doneAt: null, checkpoints: [], createdAt: '', updatedAt: '',
    };
    const untouched = { ...started, id: 'auto', source: { kind: 'audit' as const, ruleId: '2.1.3' }, status: 'todo' as const };
    const ws = { ...emptyActions('shop.com'), actions: [started, untouched] };
    const business = buildPlanInput({ domain: 'shop.com', tier: 'autopilot', keywords: emptyKeywordWorkspace('shop.com', { businessType: 'shop', seeds: { services: ['duvet covers'] } }), mapping: null, report: null, start: new Date('2026-12-01T00:00:00Z') }).business;
    const out = applyAiPlan(ws, checkPlan(plan({ months: [{ month: 2, theme: 'Pages', goal: 'g', tasks: [t('2.1', { week: 3 })] }] }), shop), { model: 'm', tokens: 10, business }, { newId, now: new Date('2026-12-01T00:00:00Z') });
    expect(out.actions.map((a) => a.id)).toEqual(['old', 'id2', 'id3']);
    expect(out.actions.find((a) => a.plan?.month === 2)).toMatchObject({ bucket: 'd60', bucketLocked: true, approval: 'client', owner: 'Automatic (after approval)', dueDate: '2027-01-19', plan: { month: 2, week: 3, doer: 'automatic', successCheck: 'Clicks up' } });
    expect(out.aiPlan).toMatchObject({ id: 'id1', tier: 'autopilot', businessType: 'ecommerce', months: [{ month: 1 }, { month: 2, theme: 'Pages' }, { month: 3 }, { month: 4 }, { month: 5 }, { month: 6 }] });
  });

  it('describes the business from the keyword workspace', () => {
    const input = buildPlanInput({ domain: 'coolco.com', tier: 'growth', keywords: emptyKeywordWorkspace('coolco.com', { seeds: { services: ['AC repair'], locations: ['Dallas'] } }), mapping: null, report: null, start: new Date('2026-12-01T00:00:00Z') });
    expect(input.business).toMatchObject({ businessType: 'local_service', capacity: PLAN_CAPACITY.growth, startDate: '2026-12-01', where: 'United States; serves Dallas' });
    expect(input.data.search_console_90_days).toBe('not connected');
  });

  it('site-wide clean-up: month 1, canonicals first, approvals by item type, nothing left out (rules 20–23)', () => {
    const page = (url: string, o: Partial<ReportPage> = {}): ReportPage => ({
      url, title: `Duvet covers in every size ${url.length} | Fold and Feel bedding`, h1: 'Duvet covers', words: 500, pageType: 'other', schemaTypes: [], links: [],
      description: `Soft cotton duvet covers in every size, delivered free across the UK in two days. Order today and sleep better, ref ${url.length}.`, h1Count: 1, noindex: false,
      images: 2, imagesNoAlt: 0, openGraph: { title: true, description: true, image: true }, ...o, canonical: o.canonical === undefined ? url : o.canonical,
    });
    const pages = cleanupPages([
      page('https://shop.com/products/duvet', { schemaTypes: ['Product'], imagesNoAlt: 3, canonical: null }),
      page('https://shop.com/collections/bedding', { title: 'Bedding', openGraph: { title: true, description: false, image: false } }),
      page('https://shop.com/collections/bedding/products/duvet', { canonical: 'https://shop.com/collections/bedding/products/duvet' }),
      page('https://shop.com/blog/how-to-wash', { pageType: 'blog_post', h1Count: 2 }),
    ], 'ecommerce');
    expect(pages.map((p) => [p.group, p.needs])).toEqual([
      ['products', ['canonical', 'alt_text']],
      ['collections', ['meta_title', 'open_graph']],
      ['products', ['canonical']],
      ['articles', ['h1']],
    ]);
    const r = checkPlan(plan({
      months: [
        { month: 1, theme: '', goal: '', tasks: [t('1.1', { title: 'Rewrite product titles', site_wide_item: 'meta_title', page_group: 'products', week: 1 })] },
        { month: 3, theme: '', goal: '', tasks: [t('3.1', { title: 'Alt text on products', site_wide_item: 'alt_text', page_group: 'products', doer: 'automatic' }), t('3.2', { title: 'New H1s on guides', doer: 'automatic_no_approval', week: 2 })] },
      ],
    }), shop, pages);
    const m1 = r.plan.months[0]!.tasks;
    const find = (item: string, group: string) => m1.find((x) => x.site_wide_item === item && x.page_group === group);
    // Added from the crawl: canonical (products, week 1), collection titles, collection Open Graph, article H1; plus the weekly check.
    expect(find('canonical', 'products')).toMatchObject({ week: 1, doer: 'automatic', urls: ['https://shop.com/products/duvet', 'https://shop.com/collections/bedding/products/duvet'] });
    const canonicalId = find('canonical', 'products')!.id;
    expect(find('meta_title', 'products')).toMatchObject({ week: 2, doer: 'automatic', depends_on: [canonicalId] });
    expect(find('meta_title', 'collections')).toMatchObject({ urls: ['https://shop.com/collections/bedding'] });
    expect(find('alt_text', 'products')).toMatchObject({ doer: 'automatic_no_approval' });
    expect(find('open_graph', 'collections')).toMatchObject({ doer: 'automatic_no_approval' });
    expect(find('h1', 'articles')).toBeTruthy();
    expect(m1.filter((x) => x.site_wide_item === 'weekly_check')).toHaveLength(1);
    // A heading change never goes live without approval.
    expect(r.plan.months[2]!.tasks.find((x) => x.title === 'New H1s on guides')).toMatchObject({ doer: 'automatic' });
    expect(r.notes.join(' ')).toMatch(/left out/);

    const business = buildPlanInput({ domain: 'shop.com', tier: 'autopilot', keywords: emptyKeywordWorkspace('shop.com', { businessType: 'shop' }), mapping: null, report: null, start: new Date('2026-12-01T00:00:00Z') }).business;
    let n = 0;
    const out = applyAiPlan(emptyActions('shop.com'), r, { model: 'm', tokens: 1, business }, { newId: () => `a${++n}` });
    expect(out.actions.find((a) => a.plan?.siteWideItem === 'alt_text')).toMatchObject({ approval: 'none', owner: 'Automatic (no approval needed)', plan: { pageGroup: 'products' } });
    expect(out.actions.find((a) => a.plan?.siteWideItem === 'canonical')).toMatchObject({ approval: 'client' });
  });

  it('tops up a short month from content, AI search and audit findings (rule 31) and sends that data to the model', () => {
    const extras = planExtrasFrom({
      content: {
        domain: 'shop.com', runAt: '', tokens: 0, usedSearchConsole: true, usedAnalytics: false, counts: { keep: 0, improve: 1, merge: 0, remove: 0 }, topicGap: [], coverage: null, pillars: [], quality: [], calendar: [], notes: [],
        inventory: [{ url: 'https://shop.com/duvets/', title: null, words: 200, pageType: null, inSitemapOnly: false, clicks: 40, impressions: 900, position: 7, prevClicks: 60, change: -33, sessions: null, conversions: null, verdict: 'improve', reason: 'Clicks down 33%' }],
        decay: [],
      },
      aeo: {
        domain: 'shop.com', history: [],
        audit: {
          domain: 'shop.com', runAt: '2026-11-20T00:00:00Z', costUsd: 0, tokens: 0, firewall: null, sources: [{ domain: 'reddit.com', count: 3 }], entity: [{ id: 'sameas', label: 'Profiles linked', ok: false, detail: 'No sameAs links' }],
          crawlers: [{ bot: 'PerplexityBot', label: 'Perplexity', purpose: 'Shows your pages in Perplexity answers', allowed: false, rule: 'Disallow: /' }],
          answers: [{ assistant: 'chatgpt', prompt: 'best duvet covers uk', shown: false, mentioned: ['rival.com'], cited: [] }],
          share: { all: [{ domain: 'rival.com', you: false, mentions: 2, share: 100 }, { domain: 'shop.com', you: true, mentions: 0, share: 0 }], chatgpt: [], perplexity: [], google: [] },
          answerReady: [], accuracy: null, controls: [], thirdParty: [], notes: [],
        },
      },
    });
    expect(extras.aiSearch).toMatchObject({ your_share_of_voice: 0, blocked_crawlers: ['PerplexityBot (Shows your pages in Perplexity answers)'], questions_where_you_are_not_named: ['best duvet covers uk'] });
    const input = buildPlanInput({ domain: 'shop.com', tier: 'autopilot', keywords: emptyKeywordWorkspace('shop.com', { businessType: 'shop' }), mapping: null, report: null, start: new Date('2026-12-01T00:00:00Z'), extras });
    expect(input.data.ai_search).toBe(extras.aiSearch);
    expect(input.business.capacity.minTasks).toBe(15);

    const candidates = topUpCandidates({ report: null, extras, domain: 'shop.com' });
    const r = checkPlan(plan(), { ...shop, capacity: { ...PLAN_CAPACITY.autopilot, minTasks: 3 } }, [], candidates);
    const m1 = r.plan.months[0]!.tasks;
    // Month 1: the model's task, the weekly check and the crawler fix (allowed from month 1).
    expect(m1.map((x) => x.title)).toContain('Let AI search crawlers read the site');
    expect(m1.length).toBeGreaterThanOrEqual(3);
    // Later months take content optimisation and AI visibility tasks; each finding is used once.
    const all = r.plan.months.flatMap((m) => m.tasks.map((x) => x.title));
    expect(all).toContain('Improve the content of /duvets/');
    expect(all).toContain('Get the business mentioned on reddit.com');
    expect(new Set(all).size).toBe(all.length);
    expect(r.plan.months.flatMap((m) => m.tasks).filter((x) => x.id.includes('topup'))).toEqual([]);
    expect(r.notes.join(' ')).toMatch(/at least 3 tasks/);
  });

  it('regenerating starts over: only finished work and changes applied to the site stay', () => {
    let n = 0;
    const base: ActionItem = {
      id: 'x', source: { kind: 'audit', ruleId: '1.5.1' }, title: 'T', detail: '', severity: 'high', impact: 4, confidence: 4, effort: 2, priority: 8, urls: [],
      owner: 'Ann', dueDate: null, approval: 'none', approvedAt: '2026-11-01', approvedBy: 'Ann', status: 'in_progress', bucket: 'd30', bucketLocked: true, before: null, doneAt: null, checkpoints: [], createdAt: '', updatedAt: '',
    };
    const ws = { ...emptyActions('shop.com'), actions: [{ ...base, id: 'started' }, { ...base, id: 'done', status: 'done' as const }, { ...base, id: 'verified', status: 'verified' as const }, { ...base, id: 'dismissed', status: 'dismissed' as const }] };
    const business = buildPlanInput({ domain: 'shop.com', tier: 'autopilot', keywords: emptyKeywordWorkspace('shop.com', { businessType: 'shop' }), mapping: null, report: null, start: new Date('2026-12-01T00:00:00Z') }).business;
    const checked = checkPlan(plan(), shop);
    const ctx = { newId: () => `n${++n}`, now: new Date('2026-12-01T00:00:00Z') };
    expect(applyAiPlan(ws, checked, { model: 'm', tokens: 1, business }, ctx).actions.map((a) => a.id)).toEqual(['started', 'done', 'verified', 'dismissed', 'n2', 'n3']);
    expect(applyAiPlan(ws, checked, { model: 'm', tokens: 1, business }, { ...ctx, fresh: true }).actions.map((a) => a.id)).toEqual(['done', 'verified', 'n5', 'n6']);
  });
});
