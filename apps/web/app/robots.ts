import type { MetadataRoute } from 'next';

// Read PUBLIC_SITE_URL at request time (it is a runtime-only variable on Coolify).
export const dynamic = 'force-dynamic';

const PRIVATE = ['/dashboard', '/audits', '/api', '/dev'];

/** AI search and assistant crawlers, named explicitly so the welcome is unambiguous (GEO/AEO). */
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];

/**
 * Only production (PUBLIC_SITE_URL set, e.g. https://msseo.tech) lets crawlers in, and
 * only to the public pages; the team's tool stays disallowed. Staging and local builds
 * block everything.
 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (!site) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: '/', disallow: PRIVATE },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
