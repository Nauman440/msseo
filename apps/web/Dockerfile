# Built by Coolify from the repo root: docker build -f apps/web/Dockerfile .
# The web app renders PDFs with Playwright (app/api/audits/[id]/pdf), so the runtime
# image is Playwright's: Chromium + fonts. Keep the tag in step with `playwright`
# in pnpm-lock.yaml (same as apps/worker/Dockerfile).
FROM mcr.microsoft.com/playwright:v1.65.0-noble AS base
# Corepack is no longer bundled with newer Node releases; install pnpm directly.
RUN npm install -g pnpm@9.15.0
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT_STANDALONE=1
RUN pnpm --filter @seo/web build

FROM mcr.microsoft.com/playwright:v1.65.0-noble AS run
WORKDIR /app
# DATA_DIR holds the audit JSON files until Postgres is wired in (Phase 1).
# Mount a Coolify persistent volume at /data so audits survive redeploys.
# REQUIRE_PREVIEW_PASSWORD makes the app refuse traffic until PREVIEW_PASSWORD is set.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data REQUIRE_PREVIEW_PASSWORD=1
RUN mkdir -p /data && chown pwuser:pwuser /data
COPY --from=build --chown=pwuser:pwuser /repo/apps/web/.next/standalone ./
COPY --from=build --chown=pwuser:pwuser /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=pwuser:pwuser /repo/apps/web/public ./apps/web/public
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
