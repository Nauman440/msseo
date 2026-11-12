import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output needs symlinks, which Windows blocks without Developer Mode;
  // the Dockerfile sets this so production images stay small.
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  transpilePackages: ['@seo/core'],
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
