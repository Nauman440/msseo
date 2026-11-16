import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// One .env at the repo root serves web and worker locally. On Coolify the variables
// come from the environment and no file exists, so this is a no-op there.
// forceReload: Next has already loaded (and cached) env from apps/web by this point.
loadEnvConfig(resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production', undefined, true);

const nextConfig: NextConfig = {
  // Standalone output needs symlinks, which Windows blocks without Developer Mode;
  // the Dockerfile sets this so production images stay small.
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  // Monorepo root, so the standalone build is laid out as apps/web/server.js
  // (what apps/web/Dockerfile runs) and workspace packages are traced.
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  transpilePackages: ['@seo/core', '@seo/db'],
  // Playwright launches a browser binary; it must stay a runtime require, not be bundled.
  // BullMQ loads its Lua scripts from disk, so it must stay a runtime require too.
  serverExternalPackages: ['playwright', 'playwright-core', 'bullmq'],
  // Playwright loads parts of itself dynamically, which file tracing can miss;
  // ship the whole package with the PDF route in the standalone (Docker) build.
  outputFileTracingIncludes: {
    '/api/audits/[id]/pdf': ['../../node_modules/.pnpm/playwright*/**/*'],
    // Prisma loads its query engine (.so.node) dynamically, which tracing misses in a pnpm monorepo.
    // BullMQ's Lua command files are read at runtime (audits are queued from server actions).
    '/**/*': ['../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*', '../../node_modules/.pnpm/bullmq@*/node_modules/bullmq/dist/**/*'],
  },
  poweredByHeader: false,
  // serverExternalPackages does not reach packages compiled via transpilePackages
  // (@seo/db imports BullMQ), so keep BullMQ out of the server bundle explicitly.
  webpack: (config, { isServer }) => {
    if (isServer) config.externals = [...(config.externals ?? []), 'bullmq'];
    return config;
  },
  // Inline the (small, ~8 KB gzipped) stylesheet into the HTML so it is not a
  // render-blocking request (our own rule 1.8.4 flagged msseo.tech for it).
  experimental: { inlineCss: true },
  async headers() {
    return [
      {
        // Security headers our own rule 1.10.3 checks for.
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
