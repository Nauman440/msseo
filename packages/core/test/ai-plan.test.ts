import { describe, expect, it } from 'vitest';
import { AI_PLAN_JSON_SCHEMA, aiPlanSchema, applyAiPlan, buildPlanInput, checkPlan, emptyActions, emptyKeywordWorkspace, PLAN_CAPACITY, type AiPlan, type AiPlanTask, type ActionItem } from '../src';

const t = (id: string, o: Partial<AiPlanTask> = {}): AiPlanTask => ({
  id, week: 1, title: `Task ${id}`, why: 'Because.', urls: ['https://shop.com/duvets/'], keywords: ['duvet covers'], change: 'Title A → Title B', category: 'on_page',
  doer: 'automatic', impact: 4, confidence: 4, effort: 2, priority: 0, depends_on: [], success_check: 'Clicks up', check_after_days: 14, ...o,
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
    expect(m1.map((x) => x.title)).toEqual(['Task 1.1', 'Remove noindex from category pages']);
    expect(m1[0]).toMatchObject({ impact: 5, effort: 1, priority: 20, id: '1.1' });
    expect(m1[1]).toMatchObject({ week: 2, id: '1.2', depends_on: ['1.1'] });
    expect(r.plan.months[2]!.tasks).toEqual([]);
    expect(r.notes.join(' ')).toMatch(/online shop/);
  });

  it('never goes over the monthly capacity: the rest goes to "later"', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => t(`1.${i + 1}`, { impact: (i % 5) + 1 }));
    const r = checkPlan(plan({ months: [{ month: 1, theme: '', goal: '', tasks }] }), shop);
    expect(r.plan.months[0]!.tasks).toHaveLength(PLAN_CAPACITY.autopilot.automatic);
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
    expect(out.actions.map((a) => a.id)).toEqual(['old', 'id2']);
    expect(out.actions[1]).toMatchObject({ bucket: 'd60', bucketLocked: true, approval: 'client', owner: 'Automatic (after approval)', dueDate: '2027-01-19', plan: { month: 2, week: 3, doer: 'automatic', successCheck: 'Clicks up' } });
    expect(out.aiPlan).toMatchObject({ id: 'id1', tier: 'autopilot', businessType: 'ecommerce', months: [{ month: 1 }, { month: 2, theme: 'Pages' }, { month: 3 }, { month: 4 }, { month: 5 }, { month: 6 }] });
  });

  it('describes the business from the keyword workspace', () => {
    const input = buildPlanInput({ domain: 'coolco.com', tier: 'growth', keywords: emptyKeywordWorkspace('coolco.com', { seeds: { services: ['AC repair'], locations: ['Dallas'] } }), mapping: null, report: null, start: new Date('2026-12-01T00:00:00Z') });
    expect(input.business).toMatchObject({ businessType: 'local_service', capacity: PLAN_CAPACITY.growth, startDate: '2026-12-01', where: 'United States; serves Dallas' });
    expect(input.data.search_console_90_days).toBe('not connected');
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
    expect(applyAiPlan(ws, checked, { model: 'm', tokens: 1, business }, ctx).actions.map((a) => a.id)).toEqual(['started', 'done', 'verified', 'dismissed', 'n2']);
    expect(applyAiPlan(ws, checked, { model: 'm', tokens: 1, business }, { ...ctx, fresh: true }).actions.map((a) => a.id)).toEqual(['done', 'verified', 'n4']);
  });
});
