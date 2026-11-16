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
RUN pnpm install --frozen-lockfile && pnpm --filter @seo/db generate
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT_STANDALONE=1
RUN pnpm --filter @seo/web build

FROM mcr.microsoft.com/playwright:v1.65.0-noble AS run
WORKDIR /app
# Audits live in Postgres (DATABASE_URL). DATA_DIR keeps the pre-database JSON audits,
# which are imported into Postgres once; keep the /data volume mounted until then.
# REQUIRE_AUTH makes the app refuse traffic until AUTH_SECRET (or the old PREVIEW_PASSWORD) is set.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data REQUIRE_AUTH=1
RUN mkdir -p /data && chown pwuser:pwuser /data
# Prisma CLI for `migrate deploy` at start-up (version must match packages/db).
# `prisma --version` downloads its engines now, as root: at runtime the app user cannot write there.
RUN npm install -g prisma@6.19.3 && prisma --version
COPY --from=build --chown=pwuser:pwuser /repo/apps/web/.next/standalone ./
COPY --from=build --chown=pwuser:pwuser /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=pwuser:pwuser /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=pwuser:pwuser /repo/packages/db/prisma ./prisma
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Apply pending database migrations (no-op when up to date), then start the app.
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then prisma migrate deploy --schema=prisma/schema.prisma; fi && exec node apps/web/server.js"]
