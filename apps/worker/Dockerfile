# Built by Coolify from the repo root: docker build -f apps/worker/Dockerfile .
# Playwright base image ships Chromium + fonts for PDF rendering. Keep its tag in
# step with the installed `playwright` version (see pnpm-lock.yaml).
FROM mcr.microsoft.com/playwright:v1.65.0-noble
# Corepack is no longer bundled with newer Node releases; install pnpm directly.
RUN npm install -g pnpm@9.15.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @seo/db generate
ENV NODE_ENV=production
USER pwuser
CMD ["pnpm", "--filter", "@seo/worker", "start"]
