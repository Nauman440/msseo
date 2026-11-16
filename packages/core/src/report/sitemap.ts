import type { AuditData } from '../audit/types';

/**
 * Corrected sitemap (spec Phase 2): the sitemap's URLs minus those we found redirecting,
 * broken, noindex or canonicalised elsewhere, plus checked indexable pages it missed.
 * URLs we could not check stay in (we only remove what we know is wrong).
 */
export const MAX_SITEMAP_URLS = 10_000;

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();

export function correctedSitemapUrls(data: AuditData): { urls: string[]; removed: number; added: number } | null {
  const listed = data.preflight.sitemaps.filter((s) => s.valid && !s.isIndex).flatMap((s) => s.urls);
  const content = data.content ?? [];
  if (!listed.length && !content.length) return null;

  const bad = new Set<string>();
  for (const c of data.preflight.sitemapUrlChecks) if (c.status !== 200) bad.add(norm(c.url));
  for (const p of data.pages) if (p.resource_type === 'html' && p.status_code !== 200) bad.add(norm(p.url));
  for (const c of content) {
    const noindex = /noindex|none/.test(c.robots ?? '');
    const elsewhere = Boolean(c.canonical) && norm(c.canonical!) !== norm(c.url);
    if (c.status !== 200 || noindex || elsewhere) bad.add(norm(c.url));
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  const push = (u: string) => {
    const k = norm(u);
    if (seen.has(k) || bad.has(k)) return false;
    seen.add(k);
    urls.push(u);
    return true;
  };
  let removed = 0;
  for (const u of listed) if (!push(u) && bad.has(norm(u))) removed++;
  let added = 0;
  for (const c of content) if (push(c.url)) added++;
  return { urls: urls.slice(0, MAX_SITEMAP_URLS), removed, added };
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function sitemapXml(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
