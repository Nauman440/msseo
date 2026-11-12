# SEO Audit Tool — Project Spec (CLAUDE.md)

> Put this file at the repo root as `CLAUDE.md`. Claude Code reads it at the start of every session.
> It is the single source of truth for what we are building, how, and in what order.
> When a decision changes, update this file in the same commit.

---

## 0. How Claude Code should work in this repo

- Build in the phase order in §12. Do not start a phase before the previous one meets its "Done when" list.
- Before writing code for any external API (DataForSEO, PageSpeed Insights, Search Console), open its official docs and confirm endpoint names, parameters and response fields. The names in this file are a starting point, not a guarantee.
- Every checklist subpoint is a **rule** (§6). Never hard-code issue text in UI components; it comes from the rules catalogue.
- TypeScript strict mode everywhere. No `any` without a comment explaining why.
- Every external call goes through a client in `packages/core/src/providers/*` with retries, timeouts and logging. Never call `fetch` to an external API from a React component or route handler directly.
- Write unit tests for every rule (fixture in, RuleResult out). Use the fixtures in `packages/core/test/fixtures/`.
- Never commit secrets. All keys come from `.env` (see §11).
- Keep the design faithful to `/design-reference/Main.dc.html` (see §9). Replicate values; do not copy its markup wholesale.
- Small commits, one concern each. Run `pnpm lint && pnpm typecheck && pnpm test` before every commit.

---

## 1. What we are building

An **internal web tool** for the **Morosoft Technologies** team (brand name and logo on the app header and PDF; logo file to be added at `apps/web/public/brand/`). A logged-in team member enters a website URL and gets a complete **technical SEO (Module 1) and on-page SEO (Module 2) audit** with a health score, charts and a prioritised fix list, matching the attached design.

The tool will grow to cover **all 13 modules of the SEO Coverage Checklist** (§16). Modules 1–2 are built first; the architecture (projects, pipeline steps, rules engine, report sections) is designed so Modules 3–13 plug in without rewrites.

- **Users:** internal team only, behind a login. No public signup.
- **Report audience switch:** each audit is run as either **Client report** (plain language, fewer details, client-ready) or **SEO expert report** (checklist IDs, all affected URLs, raw values, CSV export). Same data, different presentation (§8).
- **Search Console is optional:** if a Search Console property is selected for the audit, the Search Console–based checks run and appear in the report. If not, those checks are **skipped and hidden** (no "connect to unlock" message).
- **Crawl limit is configurable:** admin sets a default and a hard maximum; the user picks a value per audit up to that maximum.
- **Lighthouse runs on one representative page per template** (home, service, location, blog post, etc.), mobile and desktop.
- Later modules (3–13 of the SEO Coverage Checklist) plug into the same rules engine and report layout.

- **Sharing with clients is by PDF only.** No public or signed share links. The team downloads the Client-mode PDF and sends it.

### Out of scope for now
- Public free-audit funnel, pricing plans, email capture, "fix it for me" automation. The design contains these sections; build them as components but keep them hidden behind `FEATURE_SALES_SECTIONS=false` (§9.4).
- Auto-fixing sites (WordPress/Shopify). Future phase.
- Public report links.

---

## 2. Tech stack (decided)

| Layer | Choice | Notes |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `apps/worker`, `packages/core`, `packages/db` |
| Web app | Next.js 15 (App Router), React, TypeScript | UI + API routes + server actions |
| Styling | Tailwind CSS with design tokens from §9 | Inter font via `next/font` |
| Charts | Recharts for donut/gauge and bar charts; small custom SVG/CSS components for the simple progress bars | Match design exactly |
| Auth | Auth.js (NextAuth v5), Credentials provider, bcrypt | Users created by admin only |
| Database | PostgreSQL 16 | |
| ORM | Prisma | Migrations committed |
| Queue | Redis 7 + BullMQ | Audit jobs and steps |
| Worker | Node 20 process (`apps/worker`) | Runs the audit pipeline |
| Validation | Zod | All API inputs and external API responses |
| PDF export | Playwright (Chromium) rendering the report page to PDF | Runs in the worker |
| AI checks (later) | Claude API | For judgement-based rules (§6, `method: ai`) |
| Logging | pino | JSON logs |
| Tests | Vitest (unit), Playwright (e2e) | |
| Deployment | Hostinger VPS (KVM 2) with **Coolify** (self-hosted PaaS), deploys from GitHub on every push | Cloudflare for DNS/proxy; Cloudflare R2 for backups and PDFs |
| Development | No local setup: code written by Claude Code (web/cloud) on GitHub branches, checked by GitHub Actions, deployed by Coolify | See §13 |

### 2.1 Hosting decision (why not Vercel Hobby or Cloudflare Workers)

- **Vercel Hobby** is for non-commercial, personal use only. An agency's internal tool counts as commercial use. Functions max out at 5 minutes, there are 4 active CPU hours a month, and logs are kept for 1 hour. If you go over a limit, the feature can be paused for up to 30 days. The worker can't run there anyway, because it needs a long-running process for BullMQ.
- **Cloudflare Workers**: the free plan gives 10 ms of CPU and 50 outbound requests per invocation, which is not enough to crawl or call APIs at scale. The paid plan could work, using Queues/Workflows instead of BullMQ, Hyperdrive for Postgres and Browser Rendering instead of Playwright. That's a different codebase, though, and it would have to be rewritten when you move to a VPS.
- **Decision:** one Hostinger VPS (KVM 2: 2 vCPU, 8 GB RAM, 100 GB disk) using Hostinger's "Ubuntu 24.04 with Coolify" template. Coolify runs the web app, worker, Postgres and Redis, gives HTTPS automatically, and redeploys when code is pushed to GitHub. A `staging` environment (from the `develop` branch) is used for testing and a `production` environment (from `main`) for real use, on the same VPS. No one needs to install anything on their own computer. Details in §13.

---

## 3. Repository structure

```
seo-audit-tool/
├─ CLAUDE.md                     # this file
├─ design-reference/             # the exported design (Main.dc.html etc.) — read-only reference
├─ apps/web/Dockerfile           # built by Coolify
├─ apps/worker/Dockerfile        # built by Coolify (includes Chromium for PDF)
├─ docker-compose.yml            # optional: full stack for anyone who wants to run it on one machine
├─ .github/workflows/ci.yml      # lint, typecheck, unit tests, e2e against Postgres/Redis service containers
├─ .env.example
├─ apps/
│  ├─ web/                       # Next.js app
│  │  ├─ app/
│  │  │  ├─ (auth)/login/
│  │  │  ├─ (app)/dashboard/                 # list of projects + recent audits
│  │  │  ├─ (app)/projects/[projectId]/      # project page, audit history, score trend
│  │  │  ├─ (app)/audits/new/                # new audit form
│  │  │  ├─ (app)/audits/[auditId]/          # progress screen → report
│  │  │  ├─ (app)/audits/[auditId]/print/    # print layout used for PDF
│  │  │  ├─ (app)/settings/                  # admin: users, crawl limits, API keys status, GSC connection
│  │  │  └─ api/                             # route handlers (audit create, status polling, CSV export, GSC OAuth callback)
│  │  ├─ components/report/                  # Card, StatusRow, SeverityBadge, charts, sections
│  │  └─ lib/
│  └─ worker/
│     └─ src/
│        ├─ index.ts                         # BullMQ worker bootstrap
│        ├─ pipeline/                        # one file per pipeline step (§5)
│        └─ pdf/
├─ packages/
│  ├─ core/                      # pure logic, no framework code
│  │  └─ src/
│  │     ├─ providers/           # dataforseo.ts, pagespeed.ts, gsc.ts, direct-fetch.ts, claude.ts
│  │     ├─ normalise/           # turn provider responses into our SiteData model
│  │     ├─ rules/               # module1/*.ts, module2/*.ts, registry.ts
│  │     ├─ scoring/
│  │     ├─ templates/           # page-type detection for Lighthouse sampling
│  │     └─ report/              # builds ReportModel from RuleResults
│  │  └─ test/fixtures/
│  └─ db/                        # Prisma schema + client
└─ scripts/                      # seed-admin.ts, etc.
```

---

## 4. Users, auth and settings

- Roles: `admin`, `member`.
- `admin` can: create/disable users, set crawl limits, connect Search Console, see API usage, delete audits.
- `member` can: create projects, run audits, view and export reports.
- First admin is created by `pnpm seed:admin --email ... --password ...`.
- Login: email + password, bcrypt (cost 12). Rate-limit login to 5 attempts / 15 min per IP + email (Redis).
- All `(app)` routes require a session (middleware). API routes check the session and role.
- Session: Auth.js JWT strategy, 7-day expiry.

### Settings (admin, stored in `Setting` table)
| Key | Default | Meaning |
| --- | --- | --- |
| `crawl.defaultLimit` | 10 | Pre-selected page limit on the new-audit form |
| `crawl.maxLimit` | 50 | Hard cap; the form and API reject anything above it |
| `crawl.enableJsDefault` | true | JS rendering on by default |
| `lighthouse.maxTemplates` | 6 | Max page templates to run Lighthouse on |
| `audit.cacheHours` | 0 | If > 0, reuse a completed audit of the same URL + settings within N hours |
| `report.maxExampleUrlsClient` | 5 | URLs shown per issue in Client mode |

---

## 5. Audit flow and pipeline

### 5.1 New-audit form (`/audits/new`)
Fields:
1. **Website URL** (required). Normalise: add https if missing, strip path to the origin for the crawl start but keep the entered URL for display.
2. **Project** (select existing or "create new from this domain"). A project = one client domain.
3. **Report for**: `Client` | `SEO expert` (required; radio).
4. **Page limit**: dropdown with five ranges — 1–10, 11–20, 21–30, 31–40, 41–50 pages (stored as 10/20/30/40/50 in `Audit.crawlLimit`; options in `packages/core/src/audit-input.ts`). Default 1–10. Helper: "How many pages to audit. More pages take longer and use more API credits."
4a. **Email me the full report**: optional email; when set, the client/expert PDF is emailed there when the audit completes (`Audit.notifyEmail`, sent by the worker after the `pdf` step; provider via `RESEND_API_KEY` / `EMAIL_FROM`).
5. **JavaScript rendering**: toggle, default from settings. Helper: "Turn on for sites built with page builders or JS frameworks."
6. **Search Console property**: dropdown. Options = properties from the connected Google account that match the domain, plus **"None — skip Search Console checks"** (default when nothing matches or GSC isn't connected).
7. **Search Console date range**: last 28 / 90 days (only shown if a property is selected). Default 90.

On submit: create `Audit` (status `queued`), enqueue job, redirect to `/audits/[id]` which shows the progress screen.

### 5.2 Progress screen
- Polls `GET /api/audits/[id]/status` every 3 s (or SSE later).
- Shows steps with state (queued / running / done / skipped / failed) and an overall percentage.
- When status = `completed`, swap to the report. If `failed`, show which step failed and a "Retry" button (re-runs failed steps only).

### 5.3 Pipeline steps (worker)
Each step is idempotent, stores its raw output, and records start/end time in `AuditStep`. Steps marked ‖ can run in parallel.

| # | Step | What it does | Checklist |
| --- | --- | --- | --- |
| 1 | `preflight` | Resolve the 4 domain variants (http/https × www/non-www), record redirects and final URL; fetch robots.txt; locate sitemaps (robots.txt + `/sitemap.xml` + `/sitemap_index.xml`); TLS cert expiry; homepage response headers; detect tech stack from HTML/headers. | 1.1.1, 1.2.1, 1.2.3, 1.4.1, 1.6.3, 1.10.1, 1.10.3, 1.10.5 |
| 2 | `bot-access` ‖ | Request homepage with Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot user agents; compare status codes / body length with a normal browser UA. | 1.2.4 |
| 3 | `crawl-start` | DataForSEO On-Page `task_post` with `max_crawl_pages` = crawl limit, `enable_javascript` / `enable_browser_rendering` per form, `load_resources: true`, `store_raw_html: true`, `validate_micromarkup: true`, `calculate_keyword_density: true`. Save `task_id`. Record crawl date (baseline). | 1.1.2–1.1.5 |
| 4 | `crawl-wait` | Poll `summary` until `crawl_progress = finished` (or use `pingback_url` later). Timeout configurable (default 45 min). Report progress % from `pages_crawled / max_crawl_pages`. | — |
| 5 | `crawl-fetch` | Page through DataForSEO results: `pages`, `resources`, `links`, `redirect_chains`, `non_indexable`, `duplicate_tags`, `duplicate_content`, `microdata`. Store raw JSON (gzipped) per endpoint in `RawData`. | — |
| 6 | `sitemap-parse` ‖ | Download and parse all sitemaps (index + children), collect URLs; then HEAD/GET-check sitemap URLs that the crawl didn't cover (cap 1,000). | 1.4.x |
| 7 | `normalise` | Build the `SiteData` model (§5.4) from steps 1–6. Compute click depth, inlinks, orphan pages (in sitemap but 0 inlinks), template classification (§7). | — |
| 8 | `lighthouse` ‖ | For each template representative (§7): PageSpeed Insights API, `strategy=mobile` and `desktop`, category `performance` (+ `seo`, `best-practices`, `accessibility` for the home page). Store CrUX field data (`loadingExperience`, `originLoadingExperience`) and lab metrics/audits. | 1.8.x, 1.9.1, 1.9.2 |
| 9 | `gsc` ‖ (optional) | Only if a property was selected. Search Analytics (by page, by query, by page+query; current period and previous period), Sitemaps list, URL Inspection for a sample (§5.5). | 1.3.3, 1.3.4, 1.4.1, 2.9.x |
| 10 | `ai-checks` ‖ (Phase 4) | Judgement rules via Claude API on the top N pages per template. | 2.1.6, 2.1.7, 2.3.4, 2.4.2, 2.4.8, 2.7.x, 2.8.x |
| 11 | `rules` | Run every applicable rule → `RuleResult[]`. Rules whose data source was skipped get status `skipped` (not shown). | all |
| 12 | `score` | Category + overall scores, "score after fixes" (§6.4). | — |
| 13 | `finalise` | Build and store the `ReportModel` JSON on the audit; mark `completed`. | — |
| 14 | `pdf` (on demand) | Render `/audits/[id]/print` with Playwright → PDF stored on disk/S3-compatible storage. | — |

Worker concurrency: 2 audits at a time (configurable). One BullMQ job per audit; steps run inside it with checkpointing in `AuditStep`, so a retry resumes from the failed step.

### 5.4 `SiteData` (normalised model, in `packages/core`)
```ts
type SiteData = {
  audit: { url: string; origin: string; crawledAt: string; crawlLimit: number; jsRendering: boolean };
  domainVariants: { url: string; status: number; redirectsTo?: string; final: string }[];
  robots: { found: boolean; status: number; body?: string; sitemaps: string[]; rules: RobotsRule[]; parseErrors: string[] };
  sitemaps: { url: string; status: number; urlCount: number; valid: boolean; children?: string[] }[];
  sitemapUrls: { url: string; status?: number; indexable?: boolean; canonical?: string }[];
  pages: PageData[];               // one per crawled HTML URL
  resources: ResourceData[];       // images, css, js
  links: LinkData[];               // internal + external
  redirectChains: { from: string; hops: { url: string; status: number }[]; isLoop: boolean }[];
  duplicates: { type: 'title' | 'description' | 'content'; urls: string[]; similarity?: number }[];
  tls: { valid: boolean; expiresAt?: string; issuer?: string };
  headers: Record<string, string>; // homepage response headers
  techStack: { cms?: string; builder?: string; plugins: string[]; cdn?: string; server?: string };
  botAccess: { ua: string; status: number; blocked: boolean }[];
  templates: { type: PageType; urls: string[]; representative: string }[];
  lighthouse: LighthouseRun[];
  gsc?: GscData;                   // undefined when skipped
  ai?: AiFindings;                 // undefined until Phase 4
};

type PageData = {
  url: string; status: number; depth: number; inlinks: number; outlinks: number;
  indexable: boolean; noindexReason?: 'meta' | 'header' | 'robots' | 'canonical' | 'status';
  metaRobots?: string; xRobotsTag?: string; canonical?: string;
  title?: string; titleLength?: number; description?: string; descriptionLength?: number;
  h1: string[]; headings: { level: number; text: string }[];
  wordCount: number; firstWords: string;  // first 100 words
  images: { src: string; alt?: string; bytes?: number; format?: string; lazy?: boolean; width?: number; height?: number }[];
  schemaTypes: string[]; schemaErrors: string[];
  mixedContent: string[];
  hasViewport: boolean;
  pageType: PageType;
  checks: Record<string, boolean>;        // raw DataForSEO checks object
};
```

### 5.5 Search Console details
- **Connection:** one agency-level Google OAuth connection (admin connects it in Settings with the team Google account that already has access to client properties). Scopes: `https://www.googleapis.com/auth/webmasters.readonly`. Store the refresh token encrypted (AES-256-GCM, key from `ENCRYPTION_KEY`).
- **Property matching:** list properties (`sites.list`); match `sc-domain:example.com` and `https://www.example.com/` forms against the audit domain.
- **Data pulled:**
  - Search Analytics by `page`, by `query`, by `page,query` for the selected range and the previous equal range. Row limit 25,000 per request; paginate.
  - Sitemaps list (submitted? last downloaded? errors).
  - URL Inspection API on a sample: every key page (home, service, location templates) + up to 200 crawled indexable URLs. The API has a daily per-property quota, so respect it, back off on 429, and record how many were inspected.
- **Not available via API:** the "Crawled – currently not indexed" report as a whole, and manual actions / security issues. For 1.3.4, use the URL Inspection sample and label it "based on N inspected URLs". For 1.3.6, create a `manual` rule shown only in Expert mode with a "Check in Search Console" link.
- If no property is selected: skip step 9, mark all `source: gsc` rules `skipped`, hide every GSC-only card and section.

---

## 6. Rules engine

### 6.1 Rule definition
```ts
type Rule = {
  id: string;                         // checklist id, e.g. "1.3.2"; sub-variants "1.3.2-a"
  module: 1 | 2;
  category: Category;                 // see §6.3
  title: { client: string; expert: string };
  method: 'auto' | 'gsc' | 'ai' | 'manual';
  sources: ('crawl' | 'preflight' | 'sitemap' | 'lighthouse' | 'gsc' | 'ai')[];
  scope: 'site' | 'page';             // site rules pass/fail once; page rules count affected pages
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';  // default; evaluate() may raise/lower
  weight?: number;                    // overrides severity weight
  applies?: (d: SiteData) => boolean; // e.g. 1.13.x only if hreflang detected
  evaluate: (d: SiteData) => RuleResult;
  explain: { client: string; expert: string };  // why it matters (template strings with {count}, {total}, {example})
  fix: { client: string; expert: string };      // how to fix
  ice: { impact: 1|2|3|4|5; confidence: 1|2|3|4|5; effort: 1|2|3|4|5 };
};

type RuleResult = {
  ruleId: string;
  status: 'pass' | 'warn' | 'fail' | 'info' | 'skipped' | 'manual';
  severity: Severity;
  affectedCount?: number;             // pages/images/links affected
  applicableCount?: number;           // denominator
  examples: { url: string; detail?: string }[];  // full list stored, UI trims per mode
  metrics?: Record<string, number | string>;     // values for charts
  message: { client: string; expert: string };   // rendered one-liner, e.g. "Title tag missing on 24 pages"
};
```
Rules live in `packages/core/src/rules/module1/*.ts` and `module2/*.ts`, one file per checklist section (1.2, 1.3 …), registered in `registry.ts`. Text strings for both audiences live next to the rule.

### 6.2 Rule catalogue — Module 1 (Technical SEO)

Method: **A** = automatic, **G** = needs Search Console, **AI** = judgement via Claude API, **M** = manual check (shown in Expert mode only).

| ID | Check | M | Source | Pass condition / logic | Default sev. |
| --- | --- | --- | --- | --- | --- |
| 1.1.1 | Domain variants identified | A | preflight | All 4 variants resolve; record preferred | info |
| 1.1.2 | Crawl limit vs site size | A | crawl, sitemap | Warn if pages crawled = limit and sitemap has more URLs ("crawl may be incomplete") | info |
| 1.1.3 | JS rendering for JS sites | A | crawl | Warn if JS off and raw-HTML word count ≪ rendered (or framework detected) | medium |
| 1.1.4 | Raw HTML stored | A | crawl | Info only | info |
| 1.1.5 | Crawl date baseline | A | crawl | Info only | info |
| 1.2.1 | robots.txt exists and valid | A | preflight | 200, parses without errors | high |
| 1.2.2 | Important pages/resources not blocked | A | preflight, crawl | No key page (home/service/location) or CSS/JS disallowed | critical if pages, high if resources |
| 1.2.3 | Sitemap listed in robots.txt | A | preflight | ≥1 `Sitemap:` line that resolves | medium |
| 1.2.4 | Bots not blocked by firewall/CDN | A | bot-access | Googlebot UA gets 200 = critical if blocked; AI bots blocked = warn | critical / medium |
| 1.2.5 | Crawl traps | A | crawl | Detect URL patterns with date/calendar params, infinite filters, `?s=` / `/search/`, > N URLs sharing a path with only param changes | medium |
| 1.2.6 | Crawl budget waste | A | crawl | % of crawled URLs that are parameter, tag, author, attachment or paginated junk; warn > 15%, fail > 30% | medium |
| 1.3.1 | Meta robots / X-Robots-Tag recorded | A | crawl | Info table in Expert mode | info |
| 1.3.2 | No accidental noindex/nofollow on key pages | A | crawl | Any home/service/location page noindex or nofollow → fail | critical |
| 1.3.3 | Indexed vs crawled vs sitemap | G | gsc, crawl, sitemap | Funnel: crawled → indexable → in sitemap → indexed (inspection sample + pages with impressions) | high |
| 1.3.4 | Crawled/Discovered not indexed | G | gsc | From URL Inspection sample `coverageState` | high |
| 1.3.5 | Indexed junk | A/G | crawl, gsc | Tag/archive/search/staging URLs that are indexable (A) or have impressions (G) | medium |
| 1.3.6 | Manual actions / security issues | M | — | Checklist item with link to GSC | info |
| 1.4.1 | Sitemap exists, loads, submitted | A/G | sitemap, gsc | Loads + valid XML (A); submitted (G, else skipped part) | high |
| 1.4.2 | Only indexable 200 URLs | A | sitemap | % of sitemap URLs that are 200 + indexable | high |
| 1.4.3 | No redirected/404/noindex/non-canonical URLs | A | sitemap, crawl | Count of each type | high |
| 1.4.4 | Sitemap count vs indexable count | A | sitemap, crawl | Indexable pages missing from sitemap; warn > 10% | medium |
| 1.4.5 | Split sitemaps for large sites | A | sitemap | If > 1,000 URLs and single flat sitemap → warn | low |
| 1.5.1 | 4xx errors | A | crawl | Count; raise to critical if the URL has inlinks ≥ 3 or GSC clicks | high |
| 1.5.2 | 5xx errors | A | crawl | Any → fail | high |
| 1.5.3 | Redirect chains and loops | A | crawl | Chains ≥ 3 hops = warn; loops = fail | medium |
| 1.5.4 | 302 instead of 301 | A | crawl | 302/307 to same-site URL that persists | medium |
| 1.5.5 | Internal links to redirects/broken | A | crawl | Count of internal links whose target ≠ 200 | high |
| 1.5.6 | Soft 404s | A | crawl | 200 pages with very low word count + "not found" phrases, or DataForSEO soft-404 flag | low |
| 1.5.7 | Old URLs with backlinks now 404 | A | crawl (+ backlinks later) | Phase 1: 404s that still receive internal links; Phase 5: add DataForSEO Backlinks | critical |
| 1.6.1 | Canonical present and correct | A | crawl | Missing canonical = warn; canonical to another page unexpectedly = fail | high |
| 1.6.2 | Canonical targets OK | A | crawl | Canonical target is 200 + indexable | high |
| 1.6.3 | One domain version | A | preflight | Exactly one variant returns 200; others 301 to it | high |
| 1.6.4 | Trailing slash / case consistency | A | crawl | Same path served 200 with and without slash, or with uppercase | medium |
| 1.6.5 | Parameter duplicates | A | crawl | Param URLs that are indexable + self-canonical | medium |
| 1.6.6 | Duplicate / near-duplicate content | A | crawl | DataForSEO duplicate_content similarity ≥ 90% groups | critical if ≥ 10 pages, else high |
| 1.6.7 | Pagination handling | A | crawl | Paginated pages self-canonical and crawlable; not canonicalised to page 1 | low |
| 1.7.1 | Short, readable URLs | A | crawl | Length > 100 chars, IDs, uppercase, underscores, > 5 path segments | low |
| 1.7.2 | Consistent URL patterns | A | crawl, templates | Same page type uses > 1 URL pattern | low |
| 1.7.3 | No session IDs / unnecessary params | A | crawl | Session-like params (`sid`, `phpsessid`, `utm_` internally linked) | medium |
| 1.8.1 | LCP / INP / CLS | A | lighthouse | CrUX field: good / needs improvement / poor per Google thresholds (LCP 2.5/4 s, INP 200/500 ms, CLS 0.1/0.25); fall back to lab with a "lab data" label | high |
| 1.8.2 | Mobile and desktop scores | A | lighthouse | Performance score per template × device; fail < 50, warn < 90 | medium |
| 1.8.3 | Image size, format, lazy loading | A | crawl, lighthouse | Images > 200 KB, not WebP/AVIF, no lazy below fold | medium |
| 1.8.4 | Render-blocking CSS/JS | A | lighthouse | Lighthouse `render-blocking-resources` savings > 500 ms | medium |
| 1.8.5 | Unused code, heavy plugins, builders | A | lighthouse, preflight | `unused-javascript` + `unused-css-rules` savings; list builder/plugins | medium |
| 1.8.6 | TTFB | A | lighthouse, crawl | `server-response-time` > 800 ms warn, > 1.8 s fail | medium |
| 1.8.7 | Caching, compression, CDN | A | preflight, lighthouse | `uses-long-cache-ttl`, `uses-text-compression`, CDN header present | low |
| 1.8.8 | Fonts and third-party scripts | A | lighthouse | `font-display`, `third-party-summary` blocking time > 250 ms | low |
| 1.9.1 | Viewport + responsive | A | crawl, lighthouse | Viewport meta on all pages | high |
| 1.9.2 | Tap targets and font size | A | lighthouse | Relevant Lighthouse audits (where available) | low |
| 1.9.3 | Mobile vs desktop content parity | A | crawl | Phase 3: second crawl sample with mobile UA, compare word count / links ±20% | medium |
| 1.9.4 | Key content in rendered HTML | A | crawl | Raw vs rendered word count / links differ > 50% | medium |
| 1.9.5 | Popups / interstitials | AI/M | lighthouse screenshot | Phase 4: vision check on mobile screenshot; until then manual | medium |
| 1.10.1 | HTTPS, SSL valid, expiry | A | preflight, crawl | All pages https; cert valid; warn if expires < 30 days | critical if invalid |
| 1.10.2 | Mixed content | A | crawl | http resources on https pages | low |
| 1.10.3 | Security headers | A | preflight | HSTS, X-Content-Type-Options, X-Frame-Options or CSP frame-ancestors, Referrer-Policy | low |
| 1.10.4 | Hacked content / injected links | A | crawl | Spammy outbound anchors (pharma, casino, loans) or hidden links; Japanese/Cyrillic spam on English site | critical |
| 1.10.5 | Tech stack recorded | A | preflight | Info card | info |
| 1.11.1 | Schema types per page type | A | crawl, templates | Expected: home → Organization/LocalBusiness; service → Service (+FAQPage if FAQ); location → LocalBusiness/Service; blog → Article/BlogPosting; all → BreadcrumbList | high |
| 1.11.2 | Schema valid | A | crawl | DataForSEO micromarkup validation errors | medium |
| 1.11.3 | Schema matches visible content | A/AI | crawl | Name/phone/address in schema appear in page text (A); deeper match later (AI) | medium |
| 1.11.4 | Business details consistent | A | crawl | NAP in schema vs footer text on home page; phone mismatch = fail | medium |
| 1.12.1 | Key pages within 3 clicks | A | crawl, templates | Key pages (home/service/location) with depth > 3 | high |
| 1.12.2 | Orphan pages | A | crawl, sitemap | In sitemap (or GSC) with 0 internal inlinks | high |
| 1.12.3 | Nav/footer link coverage | A | crawl | % of service + location pages linked from site-wide nav/footer links | medium |
| 1.12.4 | Breadcrumbs | A | crawl | BreadcrumbList schema or breadcrumb markup on non-home templates | low |
| 1.12.5 | Broken internal + external links | A | crawl | Counts of links to 4xx/5xx | high |
| 1.12.6 | Anchor text quality | A | crawl | % internal anchors that are generic ("click here", "read more", "learn more", empty, image without alt) | medium |
| 1.12.7 | Strong pages with few inlinks | A | crawl, gsc | Key pages (or top-GSC-click pages) in the bottom 20% for inlinks | medium |
| 1.13.1–3 | International | A | crawl | `applies` only if hreflang or multiple lang attributes found; else rule not shown | medium |

### 6.3 Rule catalogue — Module 2 (On-page SEO)

| ID | Check | M | Source | Pass condition / logic | Default sev. |
| --- | --- | --- | --- | --- | --- |
| 2.1.1 | Title present | A | crawl | Missing on any indexable page | high |
| 2.1.2 | Title unique | A | crawl | Duplicate title groups | high |
| 2.1.3 | Title length 50–60 | A | crawl | Buckets: missing / < 50 / 50–60 / > 60 (chart in design) | medium |
| 2.1.4 | Keyword near start | A/G | crawl, gsc | Phase 1: page's main topic word (from H1/URL) in first 30 chars; with GSC: top query by clicks for the page | low |
| 2.1.5 | Location in local page titles | A | crawl, templates | Location pages whose title lacks the city from URL/H1 | medium |
| 2.1.6 | Title earns the click | AI | ai | Benefit/offer/proof present | low |
| 2.1.7 | Title matches content/intent | AI | ai | — | low |
| 2.2.1 | Meta description present + unique | A | crawl | Missing / duplicate groups | medium |
| 2.2.2 | Length 140–160 | A | crawl | Buckets | low |
| 2.2.3 | Benefit + CTA | AI | ai | — | low |
| 2.2.4 | Keyword in description | A/G | crawl, gsc | Same keyword source as 2.1.4 | low |
| 2.3.1 | Exactly one H1 | A | crawl | 0 or > 1 H1 | medium |
| 2.3.2 | H1 matches topic | A/AI | crawl | H1 shares main term with title/URL | low |
| 2.3.3 | Logical H2/H3 | A | crawl | Skipped levels (H1→H3), H2 before H1 | low |
| 2.3.4 | Headings cover subtopics | AI | ai | — | low |
| 2.3.5 | Headings used for styling | A | crawl | Headings < 3 words that are CTAs/phone numbers ("Call now", "Get a quote") or repeated site-wide | low |
| 2.4.1 | Depth vs top pages | A | crawl (+ SERP later) | Phase 1: word count per template vs template median; Phase 5: vs top 3 SERP results | medium |
| 2.4.2 | Intent matches page type | AI | ai | — | medium |
| 2.4.3 | Keyword in first 100 words | A | crawl | Main term (as 2.1.4) in `firstWords` | medium |
| 2.4.4 | Secondary/related terms | AI | ai | — | low |
| 2.4.5 | Entities covered | AI | ai | Brands, equipment, certifications, locations | low |
| 2.4.6 | Keyword stuffing | A | crawl | Keyword density of main term > 4% or same phrase ≥ 15 times | low |
| 2.4.7 | Original, not spun | A | crawl | Near-duplicate groups (shares data with 1.6.6) | critical |
| 2.4.8 | Readable writing | A | crawl | Flesch reading ease < 50 or avg sentence > 25 words (compute locally) | low |
| 2.4.9 | Thin pages | A | crawl | Indexable pages < 300 words (excluding contact/legal) | high |
| 2.4.10 | Outdated facts/dates | A/AI | crawl | Years ≤ current−2 in copy/titles, "R-22", old offers (A regex list); AI later | medium |
| 2.5.1 | Descriptive file names | A | crawl | `IMG_`, `DSC`, hashes, `image1` | low |
| 2.5.2 | Alt text on content images | A | crawl | Missing alt / duplicate alt (chart in design) | medium |
| 2.5.3 | Compressed and sized | A | crawl, lighthouse | > 200 KB, intrinsic size > 2× display size | medium |
| 2.5.4 | Real photos | AI/M | ai | Stock-image detection later; manual for now | low |
| 2.5.5 | Video transcript + schema | A | crawl | Embedded video without VideoObject schema or transcript text | low |
| 2.6.1 | Links to related pages | A | crawl, templates | Service pages linking to ≥1 location page and vice versa | medium |
| 2.6.2 | Descriptive anchors | A | crawl | Per-page generic anchor share (shares data with 1.12.6) | low |
| 2.6.3 | Receives links from relevant pages | A | crawl | Key pages with inlinks from < 3 distinct pages | medium |
| 2.6.4 | External links OK | A | crawl | Broken external links | low |
| 2.7.1 | Reviews/testimonials | A/AI | crawl | Review widget/schema/keywords on home + service templates | medium |
| 2.7.2 | Licences, insurance, guarantees | A/AI | crawl | Regex: "licen[cs]e", "insured", "warranty", "guarantee", "NATE", "certified" per template | high |
| 2.7.3 | Real business identity | A | crawl | Phone + address + about/team page present | medium |
| 2.7.4 | Pricing shown | A | crawl | Currency patterns on service pages | low |
| 2.7.5 | CTA above the fold | AI | lighthouse screenshot | Phase 4 | medium |
| 2.7.6 | Click-to-call + short form on mobile | A | crawl | `tel:` link site-wide; form with ≤ 5 fields | medium |
| 2.8.1 | Direct answer 40–80 words near top | A/AI | crawl | First paragraph after H1 is 40–80 words (A); quality (AI) | high |
| 2.8.2 | FAQ section | A | crawl | FAQ heading/accordion or FAQPage schema on service pages | high |
| 2.8.3 | Lists, tables, steps | A | crawl | Service pages with no `<ul>/<ol>/<table>` in main content | medium |
| 2.8.4 | Credentials shown | A | crawl | Author box / technician bio / certifications on blog + service | medium |
| 2.9.1 | Cannibalisation | G | gsc | ≥ 2 pages getting impressions for the same query, each with ≥ 20% share | high |
| 2.9.2 | Duplicate location/service pages | A | crawl | Location-template near-duplicates (shares data with 1.6.6) | critical |
| 2.9.3 | Impressions but low CTR | G | gsc | CTR < 50% of expected CTR for its position (use a CTR-by-position curve in `scoring/ctr-curve.ts`) and impressions ≥ 100 | high |
| 2.9.4 | Positions 4–20 | G | gsc | Queries with avg position 4–20 and impressions ≥ 50; chart = position vs impressions | medium |
| 2.9.5 | Traffic decay 90 days | G | gsc | Pages with clicks down ≥ 30% vs previous period and ≥ 20 clicks before | medium |

### 6.4 Categories and scoring
Categories (match the design's "Score by category"):

| Category | Rules |
| --- | --- |
| Technical SEO | 1.1–1.7, 1.11, 1.12, 1.13 |
| Speed and Core Web Vitals | 1.8 |
| Mobile | 1.9, 2.7.6 |
| Security | 1.10 |
| On-page SEO | 2.1–2.6, 2.9 |
| Trust and conversion | 2.7 (except 2.7.6) |
| AI search readiness | 2.8, 1.2.4 (AI bots part) |

Only categories that have at least one evaluated rule are shown.

**Rule score** (0–1):
- Site-scope rule: pass = 1, warn = 0.5, fail = 0.
- Page-scope rule: `1 − affectedCount / applicableCount` (clamped), then capped at 0.5 if status is `warn` and 0 if `fail` with severity critical.
- `info`, `skipped`, `manual` → excluded.

**Weights:** critical 10, high 5, medium 3, low 1 (override with `rule.weight`).

**Category score** = Σ(weight × ruleScore) / Σ(weight) × 100, rounded.
**Overall score** = weighted mean of category scores: Technical 30, On-page 25, Speed 15, Mobile 10, AI readiness 10, Trust 5, Security 5 (re-normalised over shown categories).
**Score label:** ≥ 90 "Good", 70–89 "Needs work", 50–69 "Poor", < 50 "Critical".
**Score after fixes** = recompute with every critical and high rule set to pass.
**Page health bar** (design): Healthy = indexable 200 pages with no fail-level issue; Warnings = pages with only warn-level issues; Errors = non-200 or pages with a fail-level issue.

**Action plan priority** = impact × confidence ÷ effort (from `rule.ice`), sorted descending, top 10 shown as "Top issues to fix first" (Client mode shows top 5).

All scoring code lives in `packages/core/src/scoring/` with unit tests; the formula and weights are constants in one file.

---

## 7. Page templates and Lighthouse sampling

Classify every indexable 200 HTML page into a `PageType`:
`home | service | location | service_location | blog_post | blog_index | category | contact | about | legal | other`.

Order of signals:
1. Project-level overrides: regex per type stored on `Project.templateRules` (editable in Expert mode later).
2. URL patterns: `/blog/`, `/news/`, dated paths → blog_post; `/category/`, `/tag/` → category; `/contact` → contact; `/about` → about; `/privacy|terms|cookie` → legal; `/services?/`, known HVAC service slugs (`ac-repair`, `furnace`, `heat-pump`, `duct`, `hvac`, `installation`, `maintenance`, `repair`) → service; city/area segments (`/areas/`, `/locations/`, `/service-area/`, or a slug matching a city list) → location; both → service_location.
3. Schema type (Article → blog_post, Service → service, LocalBusiness on non-home → location).
4. Fallback: cluster by first path segment; the largest unknown cluster becomes its own "other: /segment/" template.

**Representative page per template:** the indexable page with the most internal inlinks (tie-break: shortest URL). Max `lighthouse.maxTemplates` templates (priority: home, service, location, service_location, blog_post, contact, then the largest others).

For each representative: PSI mobile + desktop. Also take origin-level CrUX field data once. In the report, Core Web Vitals tiles show **field data** (mobile, origin) when available, otherwise lab data from the home page with a "Lab data" tag. Expert mode adds a per-template table (template, URL, mobile score, desktop score, LCP, INP/TBT, CLS).

PSI calls: run with concurrency 2, timeout 90 s, retry once. PSI can fail on heavy sites; mark that template `failed` and continue.

---

## 8. Report audience modes

| Aspect | Client report | SEO expert report |
| --- | --- | --- |
| Language | `title.client`, `message.client`, `explain.client`, `fix.client` (plain English, no jargon) | `*.expert` text, technical terms |
| Checklist IDs | Hidden | Shown on every row (e.g. "1.3.2") |
| Affected URLs | Up to `report.maxExampleUrlsClient` per issue | All, in an expandable list + CSV export per issue |
| Cards shown | Summary, top issues, and cards that have at least one warn/fail | Every evaluated card, including all-pass cards |
| Info / manual rules | Hidden | Shown |
| Raw data tables | Hidden | Per-template Lighthouse table, redirect chains, duplicate groups, tech stack, robots.txt content |
| Top issues list | Top 5 | Top 10 with ICE scores |
| PDF | Branded client PDF | Full technical PDF |

The mode is stored on the audit but can be toggled on the report page (a switch at the top) without re-running the audit.

---

## 9. Design system (from `/design-reference/Main.dc.html`)

### 9.1 Tokens
| Token | Value |
| --- | --- |
| Font | Inter 400/500/600/700/800 |
| Page background | `#F5F7FA` |
| Surface (cards) | `#FFFFFF` |
| Border | `#E2E8F0` |
| Input border | `#CBD5E1` |
| Text primary | `#0F172A` |
| Text secondary | `#475569` |
| Text label | `#334155` |
| Primary | `#2563EB` (hover `#1D4ED8`) |
| Primary soft (chips, banners) | bg `#EFF6FF`, text `#1D4ED8`, heading `#1E3A8A` |
| Pass / Good / Found | bg `#DCFCE7`, text `#15803D` |
| Fail / Critical / Missing | bg `#FEE2E2`, text `#B91C1C` |
| Warn / Medium / Partial | bg `#FEF9C3`, text `#854D0E` |
| High | bg `#FFEDD5`, text `#C2410C` |
| Info / Low | bg `#E2E8F0` (or `#F1F5F9`), text `#475569` |
| Chart green | `#15803D` |
| Chart yellow | `#CA8A04` |
| Chart orange | `#EA580C` |
| Chart red | `#DC2626` |
| Chart blue | `#2563EB` |
| Chart track / neutral | `#E2E8F0`, `#94A3B8` |
| Radius | card 16, inner stat tile 12, button/input 10, status pill 6, bar 3, chip 999 |
| Layout | max width 1120 px, side padding 24 px, section gap 24 px, card padding 24–28 px |
| Buttons | min-height 44–48 px, weight 600 |

Put these in `tailwind.config.ts` as named colours (`surface`, `border`, `ink`, `ink-2`, `pass`, `fail`, `warn`, `high`, `info`, `chart-*`).

### 9.2 Components to build (each with a Storybook-style demo page at `/dev/components`, dev only)
- `Card` (title, badge, children)
- `IssueBadge` ("3 issues", "20 errors", "160 pages affected" — colour by worst status)
- `StatusPill` (Pass / Fail / Warn / Info / Found / Missing / Partial)
- `StatusRow` (pill + message + optional mono URL + optional sub-text)
- `StatTile` (big number + label)
- `ScoreGauge` (donut ring, % in the middle, label below)
- `CategoryBars` (label, %, coloured bar: < 60 orange/red, 60–79 blue, ≥ 80 green — match design)
- `SeverityDonut` (total in middle + legend)
- `StackedBar` + legend (page health, sitemap valid/invalid, canonical present/missing, titles buckets, meta buckets, alt text)
- `HBarList` (status codes, click depth)
- `CwvTile` (metric, value, Good / Needs work / Poor pill)
- `TopIssuesList` (severity pill, title, sub-text, category on the right)
- `CodeBlock` (dark, suggested robots.txt)
- `ScoreAfterFixes` (two-bar chart Today vs After fixes)
- `Banner` (soft-blue CTA banner; red alert banner for the hero summary)
- `QuickWinsScatter` (2.9.4, Expert + GSC only — new, styled with the same tokens)
- `IndexFunnel` (1.3.3, GSC only — new)

### 9.3 Report layout (top to bottom)
1. Header bar: brand, project name, audit date, mode switch (Client / Expert), "Download PDF", "Re-run audit".
2. Audit meta line: URL, pages crawled, crawl date, GSC: connected property or "not used".
3. Red alert banner: one-sentence summary built from the top 3 issues (template in `report/summary.ts`).
4. Row of 3 cards: Overall SEO health (gauge) · Score by category · Issues by severity.
5. Row of 2 cards: Page health · Core Web Vitals (mobile).
6. Top issues to fix first.
7. robots.txt card (+ suggested robots.txt generated from findings) · sitemap.xml card (+ "Download corrected sitemap.xml").
8. **Technical SEO checks** section: Error pages · Canonical tags · Domain variants · Structured data · Click depth · (Expert) Redirect chains, Crawl traps/budget, Security & tech stack, Speed per template.
9. **Search Console** section (only if GSC used): Index coverage funnel · Quick wins (positions 4–20) · Low CTR pages · Cannibalisation · Decay.
10. **On-page SEO checks** section: Title tags · Meta descriptions · Headings · Content (thin pages, duplicates) · Image alt text · Trust signals · AI search readiness.
11. Action plan (top 10 with ICE in Expert mode).
12. Score after fixes.

### 9.4 Sections from the design that are hidden for now
Behind `FEATURE_SALES_SECTIONS=false`: the "Run audit" hero form (replaced by our `/audits/new` page), pricing plans, sticky "Start fixing" bar, "Fix technical issues" / "Fix on-page issues" banners, email capture box. Keep their components so the public version can switch them on later.

### 9.6 Visual direction (Search Atlas layout, Morosoft orange)
- Main colour orange: `primary #CF450A` (buttons, links, white text passes 4.5:1) and `brand #FF7A1A` (accents on dark, dark text on top). No green except pass/good status.
- Warnings use red: severity ramp medium `#F87171` → high `#DC2626` → critical `#991B1B`; low/info neutral grey; pass `#15803D`.
- Dark warm-black surfaces (`night #110D0B`) with a soft orange glow (`.bg-aurora`) for the app header, homepage hero and PDF cover; light warm canvas `#F7F6F4` for working screens.
- Inter Tight 600–800 with tight tracking (`tracking-display`) for headings; Inter for body; tabular figures for every number.
- Pill buttons (`rounded-full`); bright orange `brand` used sparingly on dark surfaces (primary CTA, live dots).
- Tokens live in `apps/web/tailwind.config.ts`; status → colour mapping only in `apps/web/lib/tones.ts`.
- PDF: A4 via `@page`, full-bleed dark cover, running footer (brand · domain, page n / total), each major section starts on a new page, cards never split.

### 9.5 Responsive
Cards stack to one column below 768 px. 3-column rows → 1 column; 2-column rows → 1 column. No horizontal scroll at 375 px. (The reference export has no viewport meta tag — ours must.)

---

## 10. Database (Prisma models — outline)

```prisma
model User        { id String @id @default(cuid()) email String @unique name String? passwordHash String role Role @default(member) active Boolean @default(true) createdAt DateTime @default(now()) audits Audit[] }
enum Role         { admin member }

model Setting     { key String @id value Json updatedAt DateTime @updatedAt }

model Project {
  id String @id @default(cuid())
  name String
  domain String @unique
  gscProperty String?
  ga4Property String?          // Module 11+
  templateRules Json?
  // business profile (used from Module 1.11.4 and later by 9, 10, 13)
  businessName String?
  phone String?
  address String?
  serviceArea Json?            // cities or { lat, lng, radiusKm }
  services String[]
  gbpUrl String?
  createdAt DateTime @default(now())
  audits Audit[]
}

model ApiUsage { id String @id @default(cuid()) auditId String? provider String endpoint String units Int costUsd Decimal? createdAt DateTime @default(now()) @@index([provider, createdAt]) }

model GscConnection { id String @id @default(cuid()) googleEmail String refreshTokenEnc String scopes String createdAt DateTime @default(now()) }

model Audit {
  id           String   @id @default(cuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id])
  createdById  String
  createdBy    User     @relation(fields: [createdById], references: [id])
  url          String
  audience     Audience           // client | expert
  crawlLimit   Int
  jsRendering  Boolean
  gscProperty  String?            // null = skipped
  gscRangeDays Int?
  status       AuditStatus        // queued | running | completed | failed | cancelled
  progress     Int      @default(0)
  dfsTaskId    String?
  pagesCrawled Int?
  overallScore Int?
  categoryScores Json?
  report       Json?              // ReportModel snapshot
  pdfPath      String?
  error        String?
  startedAt    DateTime?
  finishedAt   DateTime?
  createdAt    DateTime @default(now())
  steps        AuditStep[]
  results      RuleResultRow[]
  rawData      RawData[]
  @@index([projectId, createdAt])
}
enum Audience    { client expert }
enum AuditStatus { queued running completed failed cancelled }

model AuditStep  { id String @id @default(cuid()) auditId String audit Audit @relation(fields:[auditId], references:[id], onDelete: Cascade) name String status String startedAt DateTime? finishedAt DateTime? error String? meta Json? @@unique([auditId, name]) }

model RawData    { id String @id @default(cuid()) auditId String audit Audit @relation(fields:[auditId], references:[id], onDelete: Cascade) source String key String gz Bytes createdAt DateTime @default(now()) @@index([auditId, source]) }

model RuleResultRow { id String @id @default(cuid()) auditId String audit Audit @relation(fields:[auditId], references:[id], onDelete: Cascade) ruleId String status String severity String affectedCount Int? applicableCount Int? metrics Json? examples Json message Json @@index([auditId]) @@index([ruleId]) }
```
`RuleResultRow` per audit lets us compare audits later ("new errors since last audit").

---

## 11. Environment variables (`.env.example`)

```
# App
APP_URL=https://staging.audit.example.com     # per Coolify environment
AUTH_SECRET=                 # openssl rand -base64 32
ENCRYPTION_KEY=              # 32-byte base64, for GSC refresh tokens
FEATURE_SALES_SECTIONS=false

# Database / queue
DATABASE_URL=            # from the Coolify Postgres resource (internal URL)
REDIS_URL=               # from the Coolify Redis resource (internal URL)

# DataForSEO
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com   # use sandbox in dev; https://api.dataforseo.com in prod

# Google
PAGESPEED_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://staging.audit.example.com/api/gsc/callback

# AI (Phase 4)
ANTHROPIC_API_KEY=

# Worker
WORKER_CONCURRENCY=2
CRAWL_TIMEOUT_MINUTES=45
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=seo-audit-files      # PDFs + exports
```

---

## 12. Build phases

### Phase 0 — Foundations (week 1)
- Server: Hostinger KVM 2 with the Coolify template; Coolify projects `staging` + `production`, each with Postgres + Redis resources; GitHub app connected; `staging.audit…` and `audit…` subdomains via Cloudflare (§13).
- Monorepo, Dockerfiles for web and worker, Prisma schema + first migration, Tailwind tokens (§9.1), lint/typecheck/test scripts, CI (GitHub Actions: lint, typecheck, test with Postgres/Redis service containers).
- Auth: login page, middleware, seed-admin script, users admin page (create/disable).
- Settings page with crawl limits.
- Component demo page with all §9.2 components on fake data, matching the design screenshot.

**Done when:** a push to `develop` deploys to staging automatically; an admin can log in on staging, create a member, change crawl limits; `/dev/components` visually matches the design reference at 1280 px and 375 px.

### Phase 1 — Technical audit, end to end (weeks 2–4)
- New-audit form, Project model, BullMQ worker, progress screen.
- Steps: preflight, bot-access, crawl-start/wait/fetch (DataForSEO), sitemap-parse, normalise, templates, rules (all **A** rules of Module 1 except speed), scoring, finalise.
- Report page sections 1–8 of §9.3 (without speed tiles yet), Client/Expert switch.
- Fixtures: record real DataForSEO responses for 2–3 test sites into `test/fixtures` (scrub nothing secret; they're public sites). All rules unit-tested against fixtures.

**Done when:** entering a real URL produces a completed report in < 15 min for a 500-page site; all Module 1 auto rules have tests; failed steps can be retried.

### Phase 2 — Speed + on-page + PDF (weeks 5–6)
- Lighthouse step with template sampling (§7), CWV tiles, per-template table (Expert).
- All **A** rules of Module 2; On-page section of the report.
- Suggested robots.txt and corrected sitemap.xml downloads.
- PDF export (print route + Playwright) for both modes; CSV export per issue (Expert).

**Done when:** a full Module 1 + 2 report (auto rules) renders and exports to PDF that matches the on-screen report.

### Phase 3 — Search Console (weeks 7–8)
- Google OAuth connection in Settings, property dropdown on the new-audit form with "None — skip".
- GSC step, rules 1.3.3, 1.3.4, 1.3.5 (G part), 1.4.1 (submitted), 2.1.4/2.2.4 (GSC keyword), 2.9.x.
- Search Console report section; all GSC UI hidden when skipped.
- Project page: audit history, score trend line, "new issues since last audit" diff.

**Done when:** the same site audited with and without a GSC property produces reports where GSC content appears only in the first, and nothing references GSC in the second.

### Phase 4 — AI-assisted checks (weeks 9–10)
- `ai-checks` step using the Claude API on representative pages (cap tokens per audit; cache by page content hash).
- Rules marked **AI**; mobile screenshot checks for 1.9.5 and 2.7.5.
- Expert mode shows "AI-assessed" tag on these rows.

### Phases 5–12 — Modules 3–13
Built in the order in §16.3, each phase following the same pattern: data models → provider clients → pipeline steps → rules/outputs → report section → PDF section → tests.

### Later (no phase yet)
- Client-facing public version (turn on sales sections, add captcha + rate limits), auto-fix (WordPress/Shopify).

---

## 13. Deployment

**No local setup.** Everything runs on GitHub + one VPS; nobody installs Node, Docker or databases on their own computer.

### 13.1 Accounts and services needed from day one
| # | What | Why | Cost |
| --- | --- | --- | --- |
| 1 | GitHub organisation + private repo `seo-audit-tool` | Code, branches, pull requests, CI | Free |
| 2 | Claude Code (web, connected to the GitHub repo) | Writes code on branches and opens pull requests; runs tests in its cloud environment | Existing Claude plan |
| 3 | Hostinger VPS **KVM 2** (2 vCPU, 8 GB RAM, 100 GB) with the **"Ubuntu 24.04 with Coolify"** template | Runs staging + production: web, worker, Postgres, Redis, HTTPS | Monthly VPS fee |
| 4 | Cloudflare (free) for the domain | DNS for `audit.<domain>` and `staging.audit.<domain>`, proxy/DDoS protection; optional Cloudflare Access to restrict to team emails | Free |
| 5 | Cloudflare R2 bucket | Nightly Postgres backups (Coolify scheduled backups support S3-compatible storage) and PDF storage | Free tier, then low usage cost |
| 6 | DataForSEO account | Sandbox for staging; live API for production | Pay per use |
| 7 | Google Cloud project | PageSpeed Insights API key; OAuth client (Search Console read-only) | Free |
| 8 | Anthropic API key (Phase 4) | AI-assessed checks | Pay per use |
| 9 | Error monitoring (optional): Sentry free tier | Catch worker and web errors | Free tier |

### 13.2 Coolify setup (one time)
1. Buy KVM 2 with the Coolify template; open `http://<vps-ip>:3000` (the port in Hostinger's Coolify guide) and create the Coolify admin account; choose **localhost** as the server.
2. Point Cloudflare DNS: `coolify.<domain>` (Coolify dashboard), `audit.<domain>`, `staging.audit.<domain>` → VPS IP. Set Coolify's own dashboard domain so it runs on HTTPS; then close the raw port in the VPS firewall.
3. Connect GitHub (Coolify GitHub App) to the repo.
4. Create two Coolify **environments**: `staging` and `production`. In each: Postgres 16, Redis 7, and two applications from the repo — `web` (`apps/web/Dockerfile`, domain set) and `worker` (`apps/worker/Dockerfile`, no domain).
5. Branches: `staging` deploys from `dev`, `production` from `main`. Auto-deploy on push.
6. Env vars from §11 entered in Coolify per environment (staging uses `DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com`).
7. Pre-deploy command for `web`: `pnpm prisma migrate deploy`.
8. Scheduled backups for both Postgres databases → R2, daily, keep 14 days.
9. Turn on the VPS firewall: allow 22 (your IP only if possible), 80, 443.

### 13.3 Daily workflow
1. Write the task in Claude Code (web) against the repo, e.g. "Implement Phase 1 step `preflight` per CLAUDE.md §5.3".
2. Claude Code works on a feature branch, runs tests, opens a pull request into `develop`.
3. GitHub Actions runs lint, typecheck and tests on the PR.
4. Merge → Coolify deploys to **staging** automatically → test there with real sites (DataForSEO sandbox data for crawl results).
5. When a phase is done, merge `develop` → `main` → Coolify deploys **production** (live DataForSEO).
6. Roll back by redeploying the previous build in Coolify.

### 13.4 Capacity
KVM 2 comfortably runs both environments for an internal team (2 concurrent audits in production, 1 in staging). Move to KVM 4 when audits queue up or PDF rendering gets slow; the move is: new VPS → restore DB backup → repoint DNS.

---

## 14. Cost controls

- DataForSEO: use the **sandbox** (`sandbox.dataforseo.com`) in development and tests; it returns sample data and does not charge. Production calls only from the worker.
- Log each audit's estimated DataForSEO cost (pages × per-page price from config) on the audit; show monthly total in Settings.
- Page limit capped at 50 (`crawl.maxLimit`).
- PSI: max `lighthouse.maxTemplates × 2` calls per audit.
- Claude API (Phase 4): max pages and tokens per audit in config.

---

## 15. Decisions log

| Question | Decision |
| --- | --- |
| Search Console access | Team Google account has access to client properties → one agency-level connection |
| Crawler | DataForSEO from day one; sandbox on staging |
| Brand | Morosoft Technologies (logo to be provided → `apps/web/public/brand/`) |
| AI checks | Claude API, Phase 4 |
| Default report audience | Client |
| Sharing with clients | PDF only; no share links |
| Hosting | Hostinger KVM 2 + Coolify, no local setup (§13) |
| Scope | All 13 modules; 1–2 first (§16) |
| Visual direction (2026-11-12) | Search Atlas-inspired (§9.6). `Main.dc.html` was never added to `design-reference/`, so §9.1 status colours stay; primary moves from blue to violet `#6D40BC`; headings use Inter Tight |
| Brand (2026-11-12) | Official logo at `apps/web/public/brand/morosoft-logo.webp` (white text, for dark surfaces). `pnpm --filter @seo/web icons` derives the dark-text logo, the ring + rocket symbol, PWA icons and favicon from it. The logo keeps its own colours; the UI does not use its green |
| Colours (2026-11-12, client request) | Orange main colour, red for warnings, green only for pass (§9.6). Replaces violet primary and green accent |
| Page limit (2026-11-12, client request) | "Crawl limit" renamed "Page limit": dropdown of five ranges up to 50 pages (§5.1). Replaces the 500 default / 2,000 max |
| Email report (2026-11-12, client request) | Optional "Email me the full report" field on the new-audit form (§5.1 4a) |
| Local env (2026-11-12) | One `.env` at the repo root (copy of `.env.example`), loaded by `apps/web` (`@next/env` in next.config) and `apps/worker` (`--env-file-if-exists`). Never committed |
| Charts (2026-11-12) | Hand-built server-rendered SVG/CSS instead of Recharts: identical output on screen and in the Playwright PDF, no client JS, no zero-width ResponsiveContainer in print |
| Print route (2026-11-12) | `app/(print)/audits/[auditId]/print` (own route group, no app chrome) rather than under `(app)` |
| Design QA (2026-11-12) | Playwright e2e (`apps/web/e2e`) runs every page at desktop 1280 px and mobile 375 px: no horizontal overflow, no console errors, full-page screenshots attached to the report; runs in CI |
| PWA (2026-11-12) | Installable: `app/manifest.ts`, icons in `public/icons` (from `app/icon.svg`), `public/sw.js` caches only build assets + icons and serves `/offline.html` for offline navigations. Pages and API data are never cached |
| Branches (2026-11-12) | Repo `github.com/Nauman440/msseo`; `dev` is the working branch (staging), `main` production. Replaces `develop` in §13 |

---

## 16. Modules 3–13 (roadmap and design)

Modules 1–2 are **audits** (run → report). Most later modules are **working tools** that build up data on a project over time (competitors, keywords, mappings, actions, tracking). So the app has two kinds of things:

- **Audit runs** (`Audit` + pipeline steps + rules + report): Modules 1, 2, 6, 7, 8, 9, 10, 11.
- **Project workspaces** (persistent tables the team edits, with status and owners): Modules 3, 4, 5, 12, 13. Their outputs also feed audits (e.g. keyword mapping feeds the on-page rules, competitors feed Module 6).

Everything hangs off `Project`. Each module adds: Prisma models → provider client(s) → pipeline steps or workspace actions → rules/outputs → a report section and PDF section → tests. Before each module, add its subpoints to the rules/outputs catalogue in this file (same format as §6.2) and get it reviewed.

### 16.1 Provider APIs needed for later modules (confirm names in official docs before building)
| Provider | Used for | Modules |
| --- | --- | --- |
| DataForSEO Labs | competitors, ranked keywords, domain intersection, keyword ideas/suggestions/related, difficulty, search intent, historical traffic | 3, 4, 6, 7 |
| DataForSEO SERP API (Google organic, Maps/local pack, autocomplete, People Also Ask) | live SERP competitors, local pack, SERP features, questions | 3, 4, 6, 9 |
| DataForSEO Keywords Data (Google Ads) | search volume, CPC, 12-month trend | 4 |
| DataForSEO Backlinks API | referring domains, anchors, new/lost links, broken backlinks, link gap | 1.5.7, 6, 8 |
| DataForSEO Business Data (Google Business Profile info + reviews) | profile completeness, reviews, competitor profiles | 6, 9 |
| DataForSEO Domain Analytics (Technologies) | competitor tech stack | 6 |
| DataForSEO Content Analysis | brand mentions, unlinked mentions | 8, 10 |
| DataForSEO AI Optimization API (LLM responses / mentions) | prompt tracking across AI assistants, citations | 6.6, 10 |
| Google Search Console API | queries, pages, decay | 4, 5, 7, 11, 13 |
| Google Analytics 4 Data API (new OAuth scope `analytics.readonly`) | sessions, key events, conversions by landing page | 7, 11, 13 |
| Claude API | clustering, briefs, title/meta drafts, content quality, recommendations | 4, 5, 6, 7, 10, 12 |

### 16.2 Module by module

**Module 3 — Competitor identification** (workspace)
- Models: `Competitor { projectId, domain, name, type: direct|search|local|directory|publisher, shortlist: none|direct|aspirational, source, notes, snapshot Json, refreshedAt }`.
- 3.1 manual entry form · 3.2 Labs competitors from the client's ranked keywords · 3.3 live SERP for 10–15 core searches (from Module 4 seeds or entered) · 3.4 local pack per service × location · 3.5 auto-type with rules (directories list: Yelp, Angi, HomeAdvisor, BBB, Thumbtack, etc.) + manual override · 3.6 shortlist UI (5–8 direct, 2–3 aspirational, warn outside range) · 3.7 directories/publishers saved as listing and link targets · 3.8 strength snapshot (est. traffic, ranking keywords, referring domains, 12-month trend sparkline) · 3.9 quarterly refresh job + "new competitor" alert.
- Report section: competitor table with type badges and strength sparklines.

**Module 4 — Keyword research** (workspace)
- Models: `Keyword { projectId, term, volume, trend Json, difficulty, cpc, intent, serpFeatures, currentPosition, currentUrl, source, status: kept|removed, removeReason }`, `Cluster { projectId, name, intent, priority, businessValue, rankingChance, quickWin, longTerm, seasonalDeadline, pageType }`, `Prompt { projectId, text, service, location }`.
- 4.1 seed builder with HVAC templates (services × locations, brands/equipment, symptoms, emergency, cost, comparison, questions) + free-text from sales team · 4.2 sources: Labs ranked keywords, GSC, competitor keywords, domain intersection gap, suggestions/related/ideas, PAA + autocomplete, competitor top pages · 4.3 enrich all metrics in bulk · 4.4 cleaning rules (wrong location, jobs, free, DIY, other brands; near-duplicate merge; keep zero-volume flagged as "customer language") · 4.5 clustering (SERP-overlap similarity + Claude naming), intent label, SERP page-type check · 4.6 priority score per cluster (value × chance), quick wins (pos 4–20), long-term, seasonal · 4.7 30–50 AI prompts grouped by service/location, saved for tracking (feeds Module 10).
- UI: sortable/filterable keyword table, cluster board, CSV import/export.

**Module 5 — Keyword to page mapping** (workspace)
- Model: `PageMapping { projectId, clusterId, url?, action: optimise|expand|merge|create|leave, newPageType?, primaryKeyword, secondaryKeywords[], intent, currentPosition, targetPosition, newTitle, newH1, newMeta, linksToAdd Json, schemaNeeded[], priority, ownerId, status: todo|in_progress|live|verified }`.
- 5.1 page inventory auto-filled from the latest Module 1 crawl + GSC · 5.2 best page per cluster suggested (GSC clicks for the cluster's queries, then title/H1 match) · 5.3 "NEW PAGE NEEDED" rows · 5.4 two-pages-one-cluster conflicts (links to Module 2.9.1 cannibalisation) · 5.5–5.7 keyword and position fields · 5.8 Claude drafts title/H1/meta (approve per row) · 5.9 action · 5.10 internal links to add (from link graph: relevant pages not yet linking) · 5.11 schema needed (from §6.2 1.11.1 expectations) · 5.12–5.13 priority, owner, status.
- Feeds Module 2: once a page has a primary keyword, rules 2.1.4, 2.2.4, 2.3.2, 2.4.3 use it instead of guessing.

**Module 6 — Deep competitor analysis** (audit run, per shortlisted competitor)
- Pipeline: Labs performance (6.1) → SERP top 3–5 pages per target keyword + content parsing (6.2) → competitor homepage/template Lighthouse + technologies + sitemap/structure (6.3) → backlinks summary, referring domain quality, anchors, link gap via domain intersection, best linked pages, link types (6.4) → Business Profile + reviews + map pack position (6.5) → AI prompt runs and citations (6.6) → outputs (6.7): keyword gap top 50, content gap, link gap top 30, technical comparison table, local + AI comparison, five recommendations (Claude, grounded in the numbers).
- Report: comparison tables and charts (client vs competitors), gap lists exportable to CSV.

**Module 7 — Content audit and gap analysis** (audit run)
- 7.1 inventory with GSC clicks/impressions and GA4 conversions per URL · 7.2 classify keep/improve/merge/remove (rules on traffic, conversions, thinness, duplication, decay) · 7.3 decay list (≥ 30% down over 90 days) · 7.4 competitor topic gap (from Module 6 content gap) · 7.5 service × location coverage matrix vs the real service area (service area list on Project) · 7.6 pillar/cluster plan (from Module 4 clusters) · 7.7 quality check (Claude) · 7.8 content calendar with seasonal deadlines · 7.9 brief template generator.

**Module 8 — Backlink audit** (audit run)
- 8.1 totals · 8.2 quality and relevance (domain rank, topical match) · 8.3 spam score + spike detection from history · 8.4 anchor distribution chart · 8.5 lost links 90 days · 8.6 backlinks pointing to 404s (with redirect suggestions; also closes rule 1.5.7) · 8.7 unlinked brand mentions · 8.8 top linked pages · 8.9 opportunities from Module 6 link gap · 8.10 outreach list workspace (`OutreachTarget { domain, contact, ownerId, status }` — outreach is sent by a person, never by the tool).

**Module 9 — Local SEO audit** (audit run)
- 9.1 Business Profile completeness score · 9.2 NAP consistency across site, profile and citations · 9.3 citations on top directories (presence + NAP match) · 9.4 reviews: count, rating, velocity, reply rate · 9.5 posts/photos/Q&A activity · 9.6 **map pack ranking grid** (grid of points across the service area, local pack position per keyword per point; heat-map chart) · 9.7 location pages unique (reuses 1.6.6/2.9.2) · 9.8 local schema (reuses 1.11) · 9.9 local links (from Module 8) · 9.10 local competitor benchmark (from Module 6.5).
- Project needs: business name, address, phone, service area (cities or radius), main categories.

**Module 10 — AEO / AI search audit** (audit run + weekly tracking)
- 10.1 AI crawler access (reuses 1.2.4 + robots rules per AI bot) · 10.2 weekly prompt runs across main AI assistants using the Module 4.7 prompt list · 10.3 brand mentions/citations vs competitors · 10.4 share of voice score · 10.5 sources AI cites in the niche · 10.6 entity signals (consistent name, Organization/LocalBusiness schema, `sameAs` profiles) · 10.7 answer-ready content (reuses 2.8) · 10.8 factual accuracy of AI answers about the business (Claude compares answers with project facts) · 10.9 snippet/AI control settings (`nosnippet`, `max-snippet`, `data-nosnippet`, AI-bot blocks) · 10.10 third-party presence.
- Report: share-of-voice trend line, citation sources table, accuracy issues list.

**Module 11 — Tracking and conversion audit** (audit run)
- 11.1 GSC + GA4 connected and verified for the property · 11.2 key events present (calls, forms, chat, WhatsApp, bookings) via GA4 events list + on-site detection of `tel:`, forms, chat widgets, WhatsApp links · 11.3 call tracking detected (known call-tracking scripts / dynamic number insertion) · 11.4 source/medium hygiene (unassigned, self-referrals, `(not set)` share) · 11.5 form and CTA performance (GA4 events per page) · 11.6 landing page friction (form field count, speed from 1.8, mobile CTA from 2.7.6) · 11.7 lead quality / lead-to-job: manual checklist item with notes.

**Module 12 — Prioritisation and action plan** (workspace, always last)
- Model: `Action { projectId, sourceRuleId?/sourceModule, title (plain language), impact, confidence, effort, priority (computed), severity, ownerId, dueDate, approvalLevel: none|team_lead|client, beforeState Json, verification Json { controlPages, metric, checkpoints: [7,14,28] }, status, roadmapBucket: d30|d60|d90 }`.
- 12.1–12.2 every failed rule from any module can be turned into an Action (bulk "create actions from top issues"); priority = I × C ÷ E · 12.3 top 10 plain-language list · 12.4 owner, due date, approval · 12.5 before-state snapshot saved automatically (page HTML, title/meta, metrics) · 12.6 verification jobs at 7/14/28 days comparing the metric vs control pages · 12.7 30/60/90-day roadmap view (drawn timeline) exported to the client PDF.

**Module 13 — Reporting and monitoring** (workspace + scheduled jobs)
- 13.1 baseline snapshot (traffic, rankings, indexing, leads) saved on first full audit · 13.2 weekly summary and 13.3 monthly report templates (PDF, Morosoft branding; built from the same report components) · 13.4 alerts: downtime, noindex on key pages, robots.txt changes, traffic drops, new reviews (scheduled BullMQ repeatable jobs; notify by email) · 13.5 rank tracking keyword set (from Module 4) checked weekly via SERP API · 13.6 AI prompt tracking loaded (Module 10) · 13.7 internal dashboard per project (score trend, rankings, traffic, open actions); client view = the monthly PDF · 13.8 review meeting schedule field on the project.

### 16.3 Build order after Modules 1–2
| Phase | Module(s) | Why this order |
| --- | --- | --- |
| 5 | 3 Competitor identification | Small; feeds 4 and 6 |
| 6 | 4 Keyword research | Feeds 5, 6, 7, 10, 13 |
| 7 | 5 Keyword mapping | Makes Module 2 rules keyword-aware |
| 8 | 12 Action plan | Turns all findings so far into tracked work |
| 9 | 6 Deep competitor analysis | Needs 3 + 4 |
| 10 | 8 Backlinks + 9 Local | Share Backlinks/Business Data clients with 6 |
| 11 | 7 Content audit + 10 AEO | Need 4, 6 and GA4 |
| 12 | 11 Tracking + 13 Reporting & monitoring | Needs GA4 and all data above; adds scheduled jobs and alerts |

### 16.4 Shared building blocks to design now (so later modules don't need rewrites)
- `Project` gets business profile fields early (name, address, phone, service area, services list, GBP link) even if only Module 9 uses most of them.
- Provider clients follow one interface (auth, retry, rate-limit, cost logging per call → `ApiUsage` table).
- Report sections are registered (`reportSections: { id, module, title, component, pdfComponent, visible(model, mode) }`), so a module adds a section without touching the report page.
- Rules carry `module` and are filtered by which modules a run includes. A "Full audit" can later run several modules in one pipeline.
- Scheduled jobs use BullMQ repeatable jobs from the start (weekly re-audit is the first one).
