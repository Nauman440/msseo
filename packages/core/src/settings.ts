import { z } from 'zod';
import { PAGE_LIMIT_OPTIONS, type PageLimit } from './audit-input';

/**
 * Admin settings (spec §4 "Settings"), stored in the Setting table and editable on
 * /settings/general. Defaults apply when the table has no value (or there is no database).
 */
const pageLimit = z.coerce.number().refine((v): v is PageLimit => PAGE_LIMIT_OPTIONS.some((o) => o.value === v), 'Choose a page limit from the list');

export const settingsSchema = z
  .object({
    'crawl.defaultLimit': pageLimit.default(10),
    'crawl.maxLimit': pageLimit.default(50),
    'crawl.enableJsDefault': z.coerce.boolean().default(false),
    'lighthouse.maxTemplates': z.coerce.number().int().min(1, 'At least 1').max(6, 'At most 6').default(6),
    'report.maxExampleUrlsClient': z.coerce.number().int().min(1, 'At least 1').max(50, 'At most 50').default(5),
    /** Public free audits from the landing page (step 8): on/off and a daily spending cap. */
    'public.enabled': z.coerce.boolean().default(true),
    'public.dailyCap': z.coerce.number().int().min(0, 'At least 0').max(1000, 'At most 1000').default(30),
    /** AI-judged checks (step 7): on/off, key pages judged per audit, token budget per audit. */
    'ai.checks': z.coerce.boolean().default(true),
    'ai.maxPages': z.coerce.number().int().min(1, 'At least 1').max(10, 'At most 10').default(5),
    'ai.maxTokens': z.coerce.number().int().min(5000, 'At least 5,000').max(200000, 'At most 200,000').default(40000),
  })
  .refine((s) => s['crawl.defaultLimit'] <= s['crawl.maxLimit'], { message: 'The default page limit cannot be above the maximum', path: ['crawl.defaultLimit'] });

export type AppSettings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

/** Merges stored values over the defaults; an invalid stored value falls back to its default. */
export function resolveSettings(stored: Record<string, unknown>): AppSettings {
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    if (!(key in stored)) continue;
    const one = settingsSchema.safeParse({ ...merged, [key]: stored[key] });
    if (one.success) Object.assign(merged, { [key]: one.data[key] });
  }
  return merged;
}

/** Page-limit options the form may offer under the current maximum. */
export const pageLimitOptions = (s: AppSettings) => PAGE_LIMIT_OPTIONS.filter((o) => o.value <= s['crawl.maxLimit']);
