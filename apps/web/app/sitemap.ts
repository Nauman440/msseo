import type { MetadataRoute } from 'next';

// Read PUBLIC_SITE_URL at request time (it is a runtime-only variable on Coolify).
export const dynamic = 'force-dynamic';

/** The public landing page and the legal pages are the only indexable URLs (production only; see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (!site) return [];
  return [
    { url: `${site}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${site}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${site}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
