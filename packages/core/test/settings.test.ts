import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, pageLimitOptions, resolveSettings, settingsSchema } from '../src';

describe('admin settings', () => {
  it('uses the spec defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ 'crawl.defaultLimit': 10, 'crawl.maxLimit': 50, 'crawl.enableJsDefault': false, 'lighthouse.maxTemplates': 6, 'report.maxExampleUrlsClient': 5, 'public.enabled': true, 'public.dailyCap': 30, 'ai.checks': true, 'ai.maxPages': 5, 'ai.maxTokens': 40000, 'autopilot.enabled': true, 'autopilot.monthlyCap': 20, 'autopilot.teamSites': true, 'plan.autopilot.automatic': 15, 'plan.autopilot.newPages': 2, 'plan.autopilot.articles': 1, 'plan.growth.automatic': 40, 'plan.growth.newPages': 4, 'plan.growth.articles': 4 });
  });

  it('merges stored values and ignores invalid ones', () => {
    const s = resolveSettings({ 'crawl.maxLimit': 30, 'lighthouse.maxTemplates': 99, 'crawl.defaultLimit': 20, unknown: 1 });
    expect(s['crawl.maxLimit']).toBe(30);
    expect(s['crawl.defaultLimit']).toBe(20);
    expect(s['lighthouse.maxTemplates']).toBe(6);
    expect(pageLimitOptions(s).map((o) => o.value)).toEqual([10, 20, 30]);
  });

  it('refuses a default above the maximum', () => {
    const r = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, 'crawl.defaultLimit': 40, 'crawl.maxLimit': 20 });
    expect(r.success).toBe(false);
  });
});
