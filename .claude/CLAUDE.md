# Project: msseo — Morosoft SEO Audit Tool

## Overview
Internal SEO audit tool for the Morosoft Technologies team. Full spec: root `CLAUDE.md` (single source of truth).

## Stack
- Platform: Next.js 15 (App Router) + TypeScript, pnpm workspaces + Turborepo
- Key tools: Tailwind 3, Prisma/Postgres, BullMQ/Redis, Playwright (PDF + e2e), PWA (manifest + `public/sw.js`)
- Hosting: Hostinger VPS + Coolify (not set up yet)
- Repo: github.com/Nauman440/msseo — `dev` = working/staging branch, `main` = production

## Conventions
See `.claude/rules/` plus:
- Commit format `[area] short description`.
- Before marking UI work done: `pnpm build` then `pnpm test:e2e` (desktop 1280 + mobile 375; no horizontal overflow, no console errors).
- Colours/spacing only via tokens in `apps/web/tailwind.config.ts` and `apps/web/lib/tones.ts`.
- PDF compositions (`components/pdf/`) must not use `md:`/`lg:` classes (print viewport ≈ 673px).

## Environment / Setup
```
pnpm install
pnpm --filter @seo/db generate
pnpm dev
```

## Do Not Touch
- `design-reference/` is read-only reference material.
- Never push directly to `main` without being asked; work on `dev`.
