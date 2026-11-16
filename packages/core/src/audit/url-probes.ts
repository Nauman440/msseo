import { request, type HttpLog } from '../providers/http';
import { parsePageContent, type PageContent } from './page-content';

/**
 * Rule 1.6.4: is the same page also served (200, not canonicalised back) with the
 * trailing slash toggled, or with an uppercase path? Checks up to 3 inner pages.
 */
export type UrlVariantProbe = { url: string; variant: string; kind: 'slash' | 'case'; status: number; duplicate: boolean };

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();

export function variantsOf(url: string): { variant: string; kind: UrlVariantProbe['kind'] }[] {
  const u = new URL(url);
  if (u.pathname === '/' || u.search || /\.[a-z0-9]{2,5}$/i.test(u.pathname)) return [];
  const slash = new URL(url);
  slash.pathname = u.pathname.endsWith('/') ? u.pathname.replace(/\/+$/, '') : `${u.pathname}/`;
  const out: { variant: string; kind: UrlVariantProbe['kind'] }[] = [{ variant: slash.toString(), kind: 'slash' }];
  if (/[a-z]/.test(u.pathname)) {
    const upper = new URL(url);
    upper.pathname = u.pathname.toUpperCase();
    out.push({ variant: upper.toString(), kind: 'case' });
  }
  return out;
}

export async function probeUrlVariants(content: PageContent[], log?: HttpLog): Promise<UrlVariantProbe[]> {
  const pages = content.filter((c) => c.status === 200 && variantsOf(c.url).length).slice(0, 3);
  const jobs = pages.flatMap((c) => variantsOf(c.url).map((v) => ({ url: c.url, ...v })));
  return Promise.all(
    jobs.map(async (j): Promise<UrlVariantProbe> => {
      try {
        const res = await request(j.variant, { provider: 'site', headers: { 'user-agent': BROWSER_UA }, manualRedirect: true, timeoutMs: 6_000, retries: 0, log });
        if (res.status !== 200) {
          await res.body?.cancel();
          return { ...j, status: res.status, duplicate: false };
        }
        const page = parsePageContent((await res.text()).slice(0, 1_500_000), j.variant);
        // Served 200 but canonicalised to the real URL is acceptable.
        return { ...j, status: 200, duplicate: !page.canonical || norm(page.canonical) !== norm(j.url) || page.canonical === j.variant };
      } catch {
        return { ...j, status: 0, duplicate: false };
      }
    }),
  );
}
