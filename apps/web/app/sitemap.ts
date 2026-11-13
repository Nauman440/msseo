import type { MetadataRoute } from 'next';

// Read PUBLIC_SITE_URL at request time (it is a runtime-only variable on Coolify).
export const dynamic = 'force-dynamic';

/** The public landing page is the only indexable URL (production only; see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  return site ? [{ url: `${site}/`, changeFrequency: 'monthly', priority: 1 }] : [];
}
