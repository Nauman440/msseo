import { z } from 'zod';
import { HttpError, requestJson, type HttpLog } from './http';

/**
 * DataForSEO On-Page API client (docs: docs.dataforseo.com/v3/on_page/*, checked 2026-11-12).
 * Schemas are deliberately lenient: unknown fields pass through, missing ones become optional.
 */

const num = z.number().nullable().optional();
const str = z.string().nullable().optional();

const envelope = <T extends z.ZodTypeAny>(result: T) =>
  z.object({
    status_code: z.number(),
    status_message: z.string(),
    cost: z.number().optional(),
    tasks: z
      .array(
        z.object({
          id: z.string(),
          status_code: z.number(),
          status_message: z.string(),
          result: z.array(result).nullable().optional(),
        }),
      )
      .default([]),
  });

export const summarySchema = z
  .object({
    crawl_progress: z.enum(['in_progress', 'finished']).or(z.string()),
    crawl_stop_reason: str,
    crawl_status: z.object({ max_crawl_pages: num, pages_in_queue: num, pages_crawled: num }).partial().nullable().optional(),
    domain_info: z
      .object({
        name: str,
        cms: str,
        extended_crawl_status: str,
        server: str,
        total_pages: num,
        checks: z.record(z.boolean().nullable()).nullable().optional(),
        ssl_info: z
          .object({ valid_certificate: z.boolean().nullable().optional(), certificate_issuer: str, certificate_expiration_date: str })
          .partial()
          .nullable()
          .optional(),
      })
      .partial()
      .passthrough()
      .nullable()
      .optional(),
    page_metrics: z
      .object({ onpage_score: num, broken_links: num, duplicate_title: num, duplicate_description: num, duplicate_content: num, non_indexable: num })
      .partial()
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type OnPageSummary = z.infer<typeof summarySchema>;

export const pageSchema = z
  .object({
    resource_type: z.string(),
    url: z.string(),
    status_code: z.number(),
    location: str,
    click_depth: num,
    onpage_score: num,
    duplicate_title: z.boolean().nullable().optional(),
    duplicate_description: z.boolean().nullable().optional(),
    duplicate_content: z.boolean().nullable().optional(),
    broken_links: z.boolean().nullable().optional(),
    checks: z.record(z.boolean().nullable()).nullable().optional(),
    page_timing: z
      .object({ largest_contentful_paint: num, waiting_time: num, duration_time: num })
      .partial()
      .passthrough()
      .nullable()
      .optional(),
    meta: z
      .object({
        title: str,
        description: str,
        canonical: str,
        title_length: num,
        description_length: num,
        htags: z.record(z.array(z.string())).nullable().optional(),
        internal_links_count: num,
        inbound_links_count: num,
        images_count: num,
        content: z.object({ plain_text_word_count: num }).partial().passthrough().nullable().optional(),
      })
      .partial()
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type OnPagePage = z.infer<typeof pageSchema>;

export type CrawlOptions = {
  target: string;
  startUrl: string;
  maxCrawlPages: number;
  enableJavascript: boolean;
  /** Retry options for sites whose firewall/CDN blocks the default crawler. */
  customUserAgent?: string;
  switchPool?: boolean;
  /** Crawl only the URLs listed in this sitemap (used when link-following is blocked). */
  sitemapUrl?: string;
};

/** DataForSEO task statuses meaning "accepted, not processed yet" (docs: appendix/errors). */
const TASK_PENDING = [40601, 40602];

export type DataForSeoConfig ={ login: string; password: string; baseUrl: string; log?: HttpLog };

export function createDataForSeoClient(config: DataForSeoConfig) {
  const auth = `Basic ${Buffer.from(`${config.login}:${config.password}`).toString('base64')}`;
  const base = config.baseUrl.replace(/\/$/, '');
  /** `pendingCodes`: task statuses that mean "not ready yet" rather than an error. */
  const call = <T extends z.ZodTypeAny>(path: string, schema: T, body?: unknown, pendingCodes: number[] = []) =>
    requestJson<unknown>(`${base}${path}`, {
      provider: 'dataforseo',
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: auth },
      body,
      timeoutMs: 60_000,
      log: config.log,
    }).then((json) => {
      const parsed = envelope(schema).parse(json);
      if (parsed.status_code !== 20000) throw new HttpError(`DataForSEO: ${parsed.status_message}`, parsed.status_code);
      const task = parsed.tasks[0];
      if (!task) throw new HttpError('DataForSEO returned no task', 0);
      if (pendingCodes.includes(task.status_code)) return { task: { ...task, result: null }, cost: parsed.cost ?? 0 };
      if (task.status_code >= 40000) throw new HttpError(`DataForSEO task error: ${task.status_message}`, task.status_code);
      return { task, cost: parsed.cost ?? 0 };
    });

  return {
    /** Starts a crawl and returns the task id. */
    async startCrawl(opts: CrawlOptions): Promise<{ id: string; cost: number }> {
      const { task, cost } = await call('/v3/on_page/task_post', z.unknown(), [
        {
          target: opts.target,
          start_url: opts.startUrl,
          max_crawl_pages: opts.maxCrawlPages,
          enable_javascript: opts.enableJavascript,
          // Browser rendering needs JS + resources; both cost extra, so they follow the form toggle.
          load_resources: opts.enableJavascript,
          enable_browser_rendering: opts.enableJavascript,
          validate_micromarkup: true,
          enable_www_redirect_check: true,
          ...(opts.customUserAgent ? { custom_user_agent: opts.customUserAgent } : {}),
          ...(opts.switchPool ? { switch_pool: true } : {}),
          ...(opts.sitemapUrl ? { respect_sitemap: true, custom_sitemap: opts.sitemapUrl, crawl_sitemap_only: true } : {}),
          tag: 'morosoft-seo-audit',
        },
      ]);
      return { id: task.id, cost };
    },

    /** Null while the task is still queued (40601 "Task Handed", 40602 "Task In Queue"). */
    async summary(id: string): Promise<OnPageSummary | null> {
      const { task } = await call(`/v3/on_page/summary/${encodeURIComponent(id)}`, summarySchema, undefined, TASK_PENDING);
      return task.result?.[0] ?? null;
    },

    async pages(id: string, limit = 100): Promise<OnPagePage[]> {
      const { task } = await call(
        '/v3/on_page/pages',
        z.object({ items: z.array(pageSchema).nullable().optional() }).passthrough(),
        [{ id, limit }],
      );
      return task.result?.[0]?.items ?? [];
    },
  };
}

export type DataForSeoClient = ReturnType<typeof createDataForSeoClient>;
