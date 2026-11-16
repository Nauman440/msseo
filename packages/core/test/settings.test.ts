import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, pageLimitOptions, resolveSettings, settingsSchema } from '../src';

describe('admin settings', () => {
  it('uses the spec defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ 'crawl.defaultLimit': 10, 'crawl.maxLimit': 50, 'crawl.enableJsDefault': false, 'lighthouse.maxTemplates': 6, 'report.maxExampleUrlsClient': 5 });
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
