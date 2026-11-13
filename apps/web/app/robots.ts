import type { MetadataRoute } from 'next';

// Read PUBLIC_SITE_URL at request time (it is a runtime-only variable on Coolify).
export const dynamic = 'force-dynamic';

/**
 * Only the production site (PUBLIC_SITE_URL set, e.g. https://msseo.tech) lets search
 * engines in, and only to the landing page. Staging and local builds block everything.
 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (!site) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/$', disallow: ['/dashboard', '/audits', '/api', '/dev'] },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
