import type { HttpLog } from '../providers/http';
import { GscQuotaError, gscInspect, gscSearchAnalytics, gscSitemaps, type GscInspection, type GscRow, type GscSitemap } from '../providers/gsc';

/** Search Console data for one audit (spec §5.5). Undefined on AuditData when no property was selected. */
export type GscData = {
  property: string;
  rangeDays: number;
  current: { start: string; end: string };
  previous: { start: string; end: string };
  /** By page, current and previous period. */
  pages: GscRow[];
  pagesPrev: GscRow[];
  /** By query, current period. */
  queries: GscRow[];
  /** By page + query (keys: [page, query]), current period. */
  pageQueries: GscRow[];
  sitemaps: GscSitemap[] | null;
  inspections: GscInspection[];
  /** URLs we asked to inspect; fewer results means quota or errors. */
  inspectionRequested: number;
  inspectionQuotaHit: boolean;
  errors: string[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Search Console lags ~2–3 days: the window ends 3 days ago (UTC). */
export function gscRanges(rangeDays: number, now = new Date()) {
  const end = addDays(now, -3);
  const start = addDays(end, -(rangeDays - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(rangeDays - 1));
  return { current: { start: day(start), end: day(end) }, previous: { start: day(prevStart), end: day(prevEnd) } };
}

export const INSPECT_LIMIT = 200;

/**
 * Search Analytics + sitemaps start immediately; URL Inspection runs on `inspectUrls`
 * (key pages first) once they are known, 10 at a time, and stops at the first 429.
 */
export async function collectGsc(
  o: { token: string; property: string; rangeDays: number; inspectUrls: Promise<string[]>; log?: HttpLog },
): Promise<GscData> {
  const { current, previous } = gscRanges(o.rangeDays);
  const errors: string[] = [];
  const soft = <T,>(label: string, p: Promise<T>, fallback: T) =>
    p.catch((err: unknown) => {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    });

  const sa = (range: { start: string; end: string }, dimensions: ('page' | 'query')[], maxRows: number) =>
    gscSearchAnalytics(o.token, o.property, { startDate: range.start, endDate: range.end, dimensions, maxRows }, o.log);

  const analytics = Promise.all([
    soft('Pages', sa(current, ['page'], 25_000), [] as GscRow[]),
    soft('Pages (previous period)', sa(previous, ['page'], 25_000), [] as GscRow[]),
    soft('Queries', sa(current, ['query'], 25_000), [] as GscRow[]),
    soft('Pages by query', sa(current, ['page', 'query'], 50_000), [] as GscRow[]),
  ]);
  const sitemapsP = soft('Sitemaps', gscSitemaps(o.token, o.property, o.log), null);

  const urls = [...new Set(await o.inspectUrls)].slice(0, INSPECT_LIMIT);
  const inspections: GscInspection[] = [];
  let quotaHit = false;
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: Math.min(10, queue.length) }, async () => {
      for (let u = queue.shift(); u && !quotaHit; u = queue.shift()) {
        try {
          inspections.push(await gscInspect(o.token, o.property, u, o.log));
        } catch (err) {
          if (err instanceof GscQuotaError) quotaHit = true;
          else if (errors.length < 20) errors.push(`Inspect ${u}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
  );

  const [pages, pagesPrev, queries, pageQueries] = await analytics;
  return {
    property: o.property, rangeDays: o.rangeDays, current, previous,
    pages, pagesPrev, queries, pageQueries,
    sitemaps: await sitemapsP,
    inspections, inspectionRequested: urls.length, inspectionQuotaHit: quotaHit, errors,
  };
}
