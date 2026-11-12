# msseo — Morosoft SEO Audit Tool

Internal tool for the Morosoft Technologies team: enter a client URL and get a technical
(Module 1) and on-page (Module 2) SEO audit with a health score, prioritised fix list and a
client-ready PDF. The full spec lives in [CLAUDE.md](CLAUDE.md).

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 15 app: homepage, report, new-audit form, PDF print route, PWA |
| `apps/worker` | BullMQ worker: audit pipeline (Phase 1) and Playwright PDF rendering |
| `packages/core` | Types, scoring (§6.4), report model, sample data — no framework code |
| `packages/db` | Prisma schema (§10) and client |

## Commands

```bash
pnpm install
pnpm --filter @seo/db generate   # Prisma client
pnpm dev                         # web on :3000 (worker needs REDIS_URL)
pnpm lint && pnpm typecheck && pnpm test
pnpm build && pnpm test:e2e      # Playwright design tests, desktop 1280px + mobile 375px
pnpm pdf:sample                  # renders output/sample-report-{client,expert}.pdf (needs the web app running; APP_URL)
pnpm --filter @seo/web icons     # regenerate PWA icons from apps/web/app/icon.svg
```

On a machine with Chrome installed, set `PLAYWRIGHT_CHANNEL=chrome` to skip downloading Chromium.

## Pages

- `/` — team overview: audit launcher, recent audits, coverage, roadmap
- `/audits/demo` — sample report (`?mode=client|expert`)
- `/audits/demo/print` — A4 PDF layout (the worker prints this route)
- `/audits/new` — new-audit form
- `/dev/components` — component catalogue (dev, or `SHOW_DEV_PAGES=1`)

## Branches

`dev` → staging, `main` → production (Coolify auto-deploys, see CLAUDE.md §13).
Day-to-day work happens on `dev`.
