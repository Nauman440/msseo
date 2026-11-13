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
  transpilePackages: ['@seo/core'],
  // Playwright launches a browser binary; it must stay a runtime require, not be bundled.
  serverExternalPackages: ['playwright', 'playwright-core'],
  // Playwright loads parts of itself dynamically, which file tracing can miss;
  // ship the whole package with the PDF route in the standalone (Docker) build.
  outputFileTracingIncludes: {
    '/api/audits/[id]/pdf': ['../../node_modules/.pnpm/playwright*/**/*'],
  },
  poweredByHeader: false,
  async headers() {
    return [
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
