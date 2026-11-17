import type { HttpLog } from '../providers/http';
import { fetchPageContents, type PageContent } from './page-content';

/**
 * Rule 1.9.3 (mobile-first indexing): the key pages as served to a phone, compared with
 * the desktop fetch. Google indexes the mobile version, so text or links missing there
 * are missing for Google.
 */
export type ParityResult = { url: string; desktopWords: number; mobileWords: number; desktopLinks: number; mobileLinks: number };

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const internalLinks = (c: PageContent) => new Set(c.links.filter((l) => l.internal).map((l) => l.href)).size;

export async function checkMobileParity(desktop: PageContent[], log?: HttpLog): Promise<ParityResult[]> {
  if (!desktop.length) return [];
  const mobile = await fetchPageContents(desktop.map((d) => d.url), log, MOBILE_UA);
  const byUrl = new Map(mobile.map((m) => [m.url, m]));
  return desktop.flatMap((d) => {
    const m = byUrl.get(d.url);
    return m && m.status === 200 ? [{ url: d.url, desktopWords: d.words, mobileWords: m.words, desktopLinks: internalLinks(d), mobileLinks: internalLinks(m) }] : [];
  });
}

/** More than 20% less text or internal links on mobile (and a real difference, not a few words). */
export const parityGap = (p: ParityResult) =>
  (p.desktopWords >= 100 && p.mobileWords < p.desktopWords * 0.8 && p.desktopWords - p.mobileWords >= 50) ||
  (p.desktopLinks >= 10 && p.mobileLinks < p.desktopLinks * 0.8 && p.desktopLinks - p.mobileLinks >= 3);
