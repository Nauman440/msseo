import { isBroken, type LinkCheck } from './link-check';
import type { PageContent } from './page-content';
import { countPages, pathOf, plural, type Evaluation, type RuleDef } from './types';

/** Link-status, duplicate-content and internal-link-strength rules (spec §6.2/§6.3, batch C). */

const KEY_SKIP = /\/(blog|news|article|category|tag|author|page|privacy|terms|cookie|legal|contact|login|cart)(\/|$)/i;
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();

/**
 * Quick audits have no site-wide inlink counts: count, for each checked page, how many of the
 * other checked pages link to it (distinct pages). The homepage is never a "key page" here.
 */
export function inlinksAmongChecked(content: PageContent[]): { url: string; inlinks: number }[] {
  const pages = content.filter((c) => c.status < 400);
  return pages.map((c) => ({
    url: c.url,
    inlinks: pages.filter((o) => o !== c && o.links.some((l) => l.internal && norm(l.href.split('#')[0]!) === norm(c.url))).length,
  }));
}
const isHomeUrl = (u: string) => new URL(u).pathname.replace(/\/$/, '') === '';

/** Word 5-gram shingles of the main text. */
function shingles(text: string): Set<string> {
  const w = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(' '));
  return out;
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

/** Pages whose main text is ≥ 90% the same as another checked page (canonicalised copies excluded). */
export function nearDuplicates(content: PageContent[], threshold = 0.9): string[] {
  const pages = content
    .filter((c) => c.words >= 100 && (!c.canonical || norm(c.canonical) === norm(c.url)))
    .map((c) => ({ url: c.url, sh: shingles(c.text) }));
  const dup = new Set<string>();
  for (let i = 0; i < pages.length; i++)
    for (let j = i + 1; j < pages.length; j++)
      if (jaccard(pages[i]!.sh, pages[j]!.sh) >= threshold) dup.add(pages[i]!.url).add(pages[j]!.url);
  return [...dup];
}

function linkRule(links: LinkCheck[] | undefined, pick: (l: LinkCheck) => boolean, msg: (n: number, pages: number) => Evaluation['message'], pass: Evaluation['message']): Evaluation | null {
  const checked = (links ?? []).filter(pick);
  if (!checked.length) return null;
  const broken = checked.filter(isBroken);
  if (!broken.length) return { status: 'pass', applicable: checked.length, message: pass, metrics: { checked: checked.length } };
  const pages = [...new Set(broken.flatMap((l) => l.from))];
  return {
    status: 'fail',
    affected: broken.map((l) => l.url),
    applicable: checked.length,
    metrics: { checked: checked.length, onPages: pages.length },
    message: msg(broken.length, pages.length),
    sub: { client: `Found on: ${pages.slice(0, 3).map(pathOf).join(', ')}`, expert: `Linked from ${pages.length} page(s): ${pages.slice(0, 5).map(pathOf).join(', ')}` },
  };
}

export const linkRules: RuleDef[] = [
  {
    id: '1.5.7', module: 1, category: 'technical', card: 'errors', scope: 'page', severity: 'critical',
    title: { client: 'Links lead to pages that no longer exist', expert: 'Internal links or backlinks to 404/410 URLs' },
    explain: { client: 'Old pages that are gone but still linked (from your own pages or other websites) lose visitors and the value those links bring in Google.', expert: '4xx URLs still receiving internal links, plus pages other websites link to that now return 4xx/5xx (Module 8 backlink audit).' },
    fix: { client: 'Redirect each missing page to the closest live page, and update the links.', expert: '301 removed URLs to their best replacement; update internal links.' },
    ice: { impact: 5, confidence: 4, effort: 2 },
    evaluate: ({ data }) => {
      const internal = linkRule(data.links, (l) => l.internal && l.status !== 0 && !(l.status >= 500), (n, p) => ({ client: `${plural(n, 'link')} on ${plural(p, 'page')} go to missing pages`, expert: `${n} internal link targets return 404/410` }),
        { client: 'Internal links lead to live pages', expert: 'No internal links to 404/410' });
      const fromOthers = [...new Set(data.backlinkBroken ?? [])];
      if (!fromOthers.length) return internal;
      // Module 8: pages other websites link to that are now broken (the backlink half of 1.5.7).
      const affected = [...new Set([...(internal?.status === 'fail' ? internal.affected ?? [] : []), ...fromOthers])];
      return {
        status: 'fail',
        affected,
        applicable: (internal?.applicable ?? 0) + fromOthers.length,
        metrics: { ...(internal?.metrics ?? {}), backlinked: fromOthers.length },
        message: {
          client: `${plural(fromOthers.length, 'page')} other websites link to no longer ${fromOthers.length === 1 ? 'exists' : 'exist'}${internal?.status === 'fail' ? ', and some of your own links go to missing pages' : ''}`,
          expert: `${fromOthers.length} backlinked URLs return 4xx/5xx${internal?.status === 'fail' ? `; ${internal.affected?.length ?? 0} internal link targets 404/410` : ''}`,
        },
      };
    },
  },
  {
    id: '1.12.5', module: 1, category: 'technical', card: 'links', scope: 'page', severity: 'high',
    title: { client: 'Broken links', expert: 'Broken internal and external links' },
    explain: { client: 'Links that lead nowhere frustrate visitors and make the site look neglected.', expert: 'Links to 4xx/5xx or dead domains waste crawl and leak equity.' },
    fix: { client: 'Fix or remove the broken links.', expert: 'Update or remove links to 4xx/5xx/NXDOMAIN targets.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ data }) =>
      linkRule(data.links, (l) => l.status !== 0, (n, p) => ({ client: `${plural(n, 'broken link')} on ${plural(p, 'page')}`, expert: `${n} links to 4xx/5xx/dead domains` }),
        { client: 'No broken links found', expert: 'All checked links resolve' }),
  },
  {
    id: '2.6.4', module: 2, category: 'onpage', card: 'links', scope: 'page', severity: 'low',
    title: { client: 'Links to other websites are broken', expert: 'Broken external links' },
    explain: { client: 'Links to sites that have moved or closed make your page look out of date.', expert: 'External 404/410/NXDOMAIN targets.' },
    fix: { client: 'Update or remove links to other sites that no longer work.', expert: 'Replace dead outbound links.' },
    ice: { impact: 1, confidence: 4, effort: 1 },
    evaluate: ({ data }) =>
      linkRule(data.links, (l) => !l.internal && l.status !== 0, (n) => ({ client: `${plural(n, 'link')} to other websites ${n === 1 ? 'is' : 'are'} broken`, expert: `${n} external links 404/410/NXDOMAIN` }),
        { client: 'Links to other websites work', expert: 'No broken external links' }),
  },
  {
    id: '1.6.6', module: 1, category: 'technical', card: 'canonical', scope: 'page', severity: 'high',
    title: { client: 'Pages are near-copies of each other', expert: 'Duplicate / near-duplicate content (≥ 90%)' },
    explain: { client: 'When pages are almost the same, Google shows one and ignores the rest.', expert: '≥ 90% similar main text (DataForSEO duplicate_content or our 5-gram comparison).' },
    fix: { client: 'Rewrite these pages so each one is clearly different, or merge them.', expert: 'Differentiate, merge, or canonicalise near-duplicates.' },
    ice: { impact: 4, confidence: 4, effort: 4 },
    evaluate: ({ ok, content }) => {
      const dup = new Set([...ok.filter((p) => p.duplicate_content === true).map((p) => p.url), ...nearDuplicates(content)]);
      const pages = (ok.length ? ok : content).map((p) => ({ url: p.url }));
      const ev = countPages(pages, (p) => dup.has(p.url), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} near-copies of other pages`, expert: `${n} pages ≥ 90% similar to another page` } : { client: 'Every page is unique', expert: 'No near-duplicate groups' });
      return ev && ev.affected!.length >= 10 ? { ...ev, severity: 'critical' } : ev;
    },
  },
  {
    id: '1.12.7', module: 1, category: 'technical', card: 'depth', scope: 'page', severity: 'medium',
    title: { client: 'Important pages get few links from your own site', expert: 'Key pages in the bottom 20% for inlinks' },
    explain: { client: 'Pages you link to often look more important to Google.', expert: 'Key pages with few internal inlinks receive less equity.' },
    fix: { client: 'Link to your main service pages from more of your pages.', expert: 'Add contextual internal links to under-linked key pages.' },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: ({ ok, content, data }) => {
      if (data.mode === 'quick') {
        const pages = inlinksAmongChecked(content);
        if (pages.length < 5) return null;
        const sorted = pages.map((p) => p.inlinks).sort((a, b) => a - b);
        const p20 = sorted[Math.floor(sorted.length * 0.2)]!;
        const key = pages.filter((p) => !isHomeUrl(p.url) && !KEY_SKIP.test(new URL(p.url).pathname));
        return countPages(key, (p) => p.inlinks <= p20, (n) =>
          n ? { client: `${plural(n, 'important page')} ${n === 1 ? 'gets' : 'get'} few links from your site`, expert: `${n} key pages linked from ≤ ${p20} of the ${pages.length} checked pages (bottom 20%)` } : { client: 'Important pages are well linked', expert: 'No key page in the bottom 20% (checked pages)' }, 'warn');
      }
      const counts = ok.map((p) => p.meta?.inbound_links_count).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
      if (counts.length < 5) return null;
      const p20 = counts[Math.floor(counts.length * 0.2)]!;
      const key = ok.filter((p) => (p.click_depth ?? 9) <= 2 && (p.click_depth ?? 0) > 0 && !KEY_SKIP.test(new URL(p.url).pathname));
      return countPages(key, (p) => (p.meta?.inbound_links_count ?? 0) <= p20, (n) =>
        n ? { client: `${plural(n, 'important page')} ${n === 1 ? 'gets' : 'get'} few links from your site`, expert: `${n} key pages ≤ ${p20} inlinks (bottom 20%)` } : { client: 'Important pages are well linked', expert: 'No key page in the bottom 20% for inlinks' }, 'warn');
    },
  },
  {
    id: '2.6.3', module: 2, category: 'onpage', card: 'links', scope: 'page', severity: 'medium',
    title: { client: 'Key pages are linked from too few pages', expert: 'Key pages with < 3 internal inlinks' },
    explain: { client: 'Pages linked from only one or two places are easy for Google to overlook.', expert: 'Key pages need links from several relevant pages.' },
    fix: { client: 'Link to these pages from related pages and blog posts.', expert: 'Add ≥ 3 contextual inlinks from relevant pages.' },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: ({ ok, content, data }) =>
      data.mode === 'quick'
        ? (() => {
            const pages = inlinksAmongChecked(content);
            if (pages.length < 4) return null;
            const key = pages.filter((p) => !isHomeUrl(p.url) && !KEY_SKIP.test(new URL(p.url).pathname));
            return countPages(key, (p) => p.inlinks < 3, (n) =>
              n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} linked from fewer than 3 places`, expert: `${n} pages linked from < 3 of the ${pages.length} checked pages` } : { client: 'Key pages are linked from several places', expert: 'All key pages ≥ 3 inlinks (checked pages)' }, 'warn');
          })()
        : countPages(ok.filter((p) => (p.click_depth ?? 0) > 0 && typeof p.meta?.inbound_links_count === 'number' && !KEY_SKIP.test(new URL(p.url).pathname)), (p) => (p.meta?.inbound_links_count ?? 0) < 3, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} linked from fewer than 3 places`, expert: `${n} pages with < 3 internal inlinks` } : { client: 'Key pages are linked from several places', expert: 'All key pages ≥ 3 inlinks' }, 'warn'),
  },
];
