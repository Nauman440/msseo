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
        audits: z
          .record(
            z
              .object({
                numericValue: z.number(),
                metricSavings: z.record(z.number()),
                details: z.object({ overallSavingsMs: z.number() }).partial().passthrough(),
              })
              .partial()
              .passthrough(),
          )
          .optional(),
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
  /** Lighthouse's estimated LCP/FCP saving from removing render-blocking requests; null if not reported. */
  renderBlockingMs: number | null;
  /** Lighthouse 13 insights used by rules 1.8.3, 1.8.5, 1.8.7, 1.8.8 and 2.5.3 (null when not reported). */
  insights?: PsiInsights;
};

export type PsiInsights = {
  /** image-delivery-insight: images that could be smaller (compression, format or oversized). */
  images: { url: string; totalBytes: number; wastedBytes: number; oversized: boolean; format: boolean }[] | null;
  /** unsized-images: <img> without explicit width/height. */
  unsizedImages: number | null;
  unusedJsBytes: number | null;
  unusedCssBytes: number | null;
  /** Estimated LCP/FCP saving from removing unused JS and CSS. */
  unusedMs: number | null;
  /** cache-insight: bytes re-downloaded on repeat visits because of short cache lifetimes. */
  cacheWastedBytes: number | null;
  /** document-latency-insight checklist (falls back to uses-text-compression). */
  compression: boolean | null;
  /** font-display-insight: render delay from fonts without font-display. */
  fontDisplayMs: number | null;
  /** third-parties-insight: main-thread time per third-party entity, largest first. */
  thirdParties: { entity: string; mainThreadMs: number }[] | null;
};

type Audit = { score?: number | null; numericValue?: number; metricSavings?: Record<string, number>; details?: Record<string, unknown> };
const items = (a: Audit | undefined) => (Array.isArray(a?.details?.items) ? (a!.details!.items as Record<string, unknown>[]) : null);
const sum = (list: Record<string, unknown>[] | null, key: string) => (list ? list.reduce((s, i) => s + (Number(i[key]) || 0), 0) : null);
const maxSaving = (...list: (Audit | undefined)[]) => (list.some(Boolean) ? Math.max(0, ...list.map((a) => Math.max(a?.metricSavings?.LCP ?? 0, a?.metricSavings?.FCP ?? 0))) : null);

export function readInsights(audits: Record<string, Audit>): PsiInsights {
  const img = items(audits['image-delivery-insight']);
  const reasons = (i: Record<string, unknown>) => {
    const sub = (i.subItems as { items?: { reason?: string }[] } | undefined)?.items ?? [];
    return sub.map((s) => s.reason ?? '').join(' ');
  };
  const checklist = audits['document-latency-insight']?.details?.items as { usesCompression?: { value?: boolean } } | undefined;
  const compressionAudit = audits['uses-text-compression'];
  const tp = items(audits['third-parties-insight']);
  return {
    images: img ? img.map((i) => ({ url: String(i.url ?? ''), totalBytes: Number(i.totalBytes) || 0, wastedBytes: Number(i.wastedBytes) || 0, oversized: /larger than it needs to be|responsive images/i.test(reasons(i)), format: /modern image format/i.test(reasons(i)) })) : null,
    unsizedImages: items(audits['unsized-images'])?.length ?? null,
    unusedJsBytes: sum(items(audits['unused-javascript']), 'wastedBytes'),
    unusedCssBytes: sum(items(audits['unused-css-rules']), 'wastedBytes'),
    unusedMs: maxSaving(audits['unused-javascript'], audits['unused-css-rules']),
    cacheWastedBytes: sum(items(audits['cache-insight']), 'wastedBytes'),
    compression: typeof checklist?.usesCompression?.value === 'boolean' ? checklist.usesCompression.value : compressionAudit ? compressionAudit.score === 1 : null,
    fontDisplayMs: audits['font-display-insight'] ? (audits['font-display-insight'].numericValue ?? 0) : null,
    thirdParties: tp
      ? tp.map((i) => ({ entity: String(i.entity ?? ''), mainThreadMs: Math.round(Number(i.mainThreadTime) || sum((i.subItems as { items?: Record<string, unknown>[] })?.items ?? [], 'mainThreadTime') || 0) })).sort((a, b) => b.mainThreadMs - a.mainThreadMs)
      : null,
  };
}

export async function runPageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop',
  apiKey: string,
  log?: HttpLog,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<PageSpeedResult> {
  const qs = new URLSearchParams({ url, strategy, category: 'performance', key: apiKey });
  const json = psiSchema.parse(
    await requestJson(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, {
      provider: 'pagespeed',
      timeoutMs: opts.timeoutMs ?? 90_000,
      retries: opts.retries ?? 1,
      log,
    }),
  );
  const m = json.loadingExperience?.metrics;
  const audits = json.lighthouseResult?.audits ?? {};
  const hasField = Boolean(m?.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
  const score = json.lighthouseResult?.categories?.performance?.score;
  // Lighthouse 13 calls it 'render-blocking-insight' (savings in metricSavings);
  // older versions 'render-blocking-resources' (numericValue / overallSavingsMs).
  const rb = audits['render-blocking-insight'] ?? audits['render-blocking-resources'];
  const renderBlockingMs = rb
    ? Math.max(rb.metricSavings?.LCP ?? 0, rb.metricSavings?.FCP ?? 0, rb.details?.overallSavingsMs ?? 0, rb.numericValue ?? 0)
    : null;

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
    renderBlockingMs,
    insights: readInsights(audits as Record<string, Audit>),
  };
}
