import { z } from 'zod';
import { requestJson, type HttpLog } from './http';

/** PageSpeed Insights v5 (developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed). */

const metric = z.object({ percentile: z.number().optional(), category: z.string().optional() }).partial();

const psiSchema = z
  .object({
    loadingExperience: z
      .object({
        metrics: z
          .object({
            LARGEST_CONTENTFUL_PAINT_MS: metric,
            INTERACTION_TO_NEXT_PAINT: metric,
            CUMULATIVE_LAYOUT_SHIFT_SCORE: metric,
            EXPERIMENTAL_TIME_TO_FIRST_BYTE: metric,
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
    lighthouseResult: z
      .object({
        categories: z.object({ performance: z.object({ score: z.number().nullable() }).partial() }).partial().optional(),
        audits: z.record(z.object({ numericValue: z.number().optional() }).partial().passthrough()).optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

export type PageSpeedResult = {
  strategy: 'mobile' | 'desktop';
  url: string;
  /** 0–100 Lighthouse performance score. */
  performance: number | null;
  field: { lcpMs?: number; inpMs?: number; cls?: number; ttfbMs?: number } | null;
  lab: { lcpMs?: number; cls?: number; tbtMs?: number; ttfbMs?: number };
};

export async function runPageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop',
  apiKey: string,
  log?: HttpLog,
): Promise<PageSpeedResult> {
  const qs = new URLSearchParams({ url, strategy, category: 'performance', key: apiKey });
  const json = psiSchema.parse(
    await requestJson(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, {
      provider: 'pagespeed',
      timeoutMs: 90_000,
      retries: 1,
      log,
    }),
  );
  const m = json.loadingExperience?.metrics;
  const audits = json.lighthouseResult?.audits ?? {};
  const hasField = Boolean(m?.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
  const score = json.lighthouseResult?.categories?.performance?.score;

  return {
    strategy,
    url,
    performance: typeof score === 'number' ? Math.round(score * 100) : null,
    field: hasField
      ? {
          lcpMs: m?.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
          inpMs: m?.INTERACTION_TO_NEXT_PAINT?.percentile,
          // CrUX reports CLS × 100.
          cls: m?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile !== undefined ? m.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : undefined,
          ttfbMs: m?.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile,
        }
      : null,
    lab: {
      lcpMs: audits['largest-contentful-paint']?.numericValue,
      cls: audits['cumulative-layout-shift']?.numericValue,
      tbtMs: audits['total-blocking-time']?.numericValue,
      ttfbMs: audits['server-response-time']?.numericValue,
    },
  };
}
