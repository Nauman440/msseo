import { hasSchema, isGenericAnchor, phonesIn, schemaValues, SPAM } from './content-signals';
import type { PageContent } from './page-content';
import { countPages, plural, type RuleDef } from './types';

/** Module 1 rules read from each page's own HTML and the homepage headers (spec §6.2). */

const JS_FRAMEWORKS = ['nextjs', 'react', 'vue', 'nuxt', 'angular', 'gatsby'];
const BUILDERS = ['elementor', 'divi', 'wpbakery'];
const CMS = ['wordpress', 'shopify', 'wix', 'squarespace', 'webflow'];
const HREFLANG = /^([a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?|x-default)$/i;
const FOREIGN_SCRIPT = /[぀-ヿ一-鿿Ѐ-ӿ]{6,}/;
const isHome = (c: PageContent) => new URL(c.url).pathname.replace(/\/$/, '') === '';
const sameUrl = (a: string, b: string) => a.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') === b.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const bodyLinks = (c: PageContent) => c.links.filter((l) => l.internal && !l.inNav);

export function cdnOf(h: Record<string, string>): string | undefined {
  if (h['cf-ray']) return 'Cloudflare';
  if (h['x-vercel-id']) return 'Vercel';
  if (h['x-amz-cf-id']) return 'CloudFront';
  if (h['x-fastly-request-id'] || /fastly/i.test(h['via'] ?? '')) return 'Fastly';
  if (h['x-akamai-transformed'] || /akamai/i.test(h['server'] ?? '')) return 'Akamai';
  if (h['x-sucuri-id']) return 'Sucuri';
  if (/bunnycdn/i.test(h['server'] ?? '')) return 'BunnyCDN';
  return undefined;
}

export const siteRules: RuleDef[] = [
  {
    id: '1.1.3', module: 1, category: 'technical', card: 'indexing', scope: 'site', severity: 'medium',
    title: { client: 'The site needs a deeper scan to be read properly', expert: 'JS framework detected with JS rendering off' },
    explain: { client: 'This site builds its pages with JavaScript, so a plain scan sees very little text.', expert: 'Raw HTML has little content and a JS framework is present; results without rendering may be incomplete.' },
    fix: { client: 'Run the audit again with JavaScript rendering turned on.', expert: 'Re-run with enable_javascript; consider SSR/prerendering for crawlers.' },
    ice: { impact: 3, confidence: 3, effort: 1 },
    evaluate: ({ data, home }) => {
      if (data.jsRendering || !home) return null;
      const framework = home.hints.find((h) => JS_FRAMEWORKS.includes(h));
      if (framework && home.words < 150)
        return { status: 'warn', affected: [home.url], message: { client: 'The homepage shows little text without JavaScript', expert: `${framework} detected; ${home.words} words in raw HTML` }, metrics: { framework, rawWords: home.words } };
      return { status: 'pass', message: { client: 'Pages can be read without JavaScript', expert: 'Raw HTML carries the content' } };
    },
  },
  {
    id: '1.3.1', module: 1, category: 'technical', card: 'indexing', scope: 'site', severity: 'info',
    title: { client: 'Robots directives', expert: 'Meta robots / X-Robots-Tag on the homepage' },
    explain: { client: 'Recorded for reference.', expert: 'Recorded for reference; key-page noindex is checked by 1.3.2.' },
    fix: { client: 'Nothing to do.', expert: 'None.' },
    ice: { impact: 1, confidence: 5, effort: 1 },
    evaluate: ({ data }) => {
      const d = data.preflight.homepage.robotsDirectives;
      return { status: 'info', message: { client: d.length ? `Homepage directives: ${d.join(', ')}` : 'No robots directives on the homepage', expert: d.length ? `Homepage: ${d.join(', ')}` : 'Homepage: none (defaults to index, follow)' } };
    },
  },
  {
    id: '1.9.1', module: 1, category: 'mobile', card: 'mobile', scope: 'page', severity: 'high',
    title: { client: 'Pages are not set up for phones', expert: 'Missing viewport meta tag' },
    explain: { client: 'Without this setting, phones show a tiny desktop version of the page.', expert: 'No <meta name="viewport"> breaks mobile-first rendering.' },
    fix: { client: 'Ask your developer to add the mobile viewport setting to every page.', expert: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' },
    ice: { impact: 4, confidence: 5, effort: 1 },
    evaluate: ({ content }) =>
      countPages(content, (c) => !c.viewport, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} not set up for phones`, expert: `${n} pages without viewport meta` } : { client: 'Every page is set up for phones', expert: 'Viewport meta on every page' }),
  },
  {
    id: '1.9.4', module: 1, category: 'mobile', card: 'mobile', scope: 'page', severity: 'medium',
    title: { client: 'Content only appears after JavaScript runs', expert: 'Raw vs rendered content differs > 50%' },
    explain: { client: 'If text only appears after scripts run, search engines may miss it.', expert: 'Rendered word count is more than double the raw HTML; indexing depends on rendering.' },
    fix: { client: 'Ask your developer to put the main text in the page itself, not loaded by scripts.', expert: 'Server-render or prerender key content.' },
    ice: { impact: 3, confidence: 3, effort: 4 },
    evaluate: ({ data, content, ok }) => {
      if (!data.jsRendering) return null;
      const rendered = new Map(ok.map((p) => [p.url, p.meta?.content?.plain_text_word_count ?? 0]));
      const pairs = content.filter((c) => (rendered.get(c.url) ?? 0) >= 100);
      return countPages(pairs, (c) => c.words < (rendered.get(c.url) ?? 0) / 2, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'shows' : 'show'} most text only after scripts run`, expert: `${n} pages with raw < 50% of rendered words` } : { client: 'Content is in the page itself', expert: 'Raw and rendered content match' }, 'warn');
    },
  },
  {
    id: '1.10.4', module: 1, category: 'security', card: 'stack', scope: 'page', severity: 'critical',
    title: { client: 'Signs the site may be hacked', expert: 'Spam/injected content or links' },
    explain: { client: 'Hidden spam links or foreign text usually mean the site was hacked; Google may warn visitors.', expert: 'Pharma/casino/loan anchors or CJK/Cyrillic spam on a non-matching site indicate injection.' },
    fix: { client: 'Have your developer clean the site and change all passwords now.', expert: 'Remove injected content, patch the CMS/plugins, rotate credentials, request review in GSC.' },
    ice: { impact: 5, confidence: 3, effort: 3 },
    evaluate: ({ content }) =>
      countPages(content, (c) => {
        const latin = !c.lang || /^(en|fr|de|es|it|pt|nl)/i.test(c.lang);
        return c.links.some((l) => !l.internal && SPAM.test(l.text)) || SPAM.test(c.text) || (latin && FOREIGN_SCRIPT.test(c.fullText));
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'shows' : 'show'} signs of spam`, expert: `${n} pages with spam terms/links or foreign-script injection` } : { client: 'No signs of hacking', expert: 'No injected spam detected' }),
  },
  {
    id: '1.10.5', module: 1, category: 'security', card: 'stack', scope: 'site', severity: 'info',
    title: { client: 'Website technology', expert: 'Tech stack' },
    explain: { client: 'Recorded for reference.', expert: 'Detected from HTML and response headers.' },
    fix: { client: 'Nothing to do.', expert: 'None.' },
    ice: { impact: 1, confidence: 4, effort: 1 },
    evaluate: ({ data, home }) => {
      const h = data.preflight.homepage.headers;
      const hints = home?.hints ?? [];
      const parts: Record<string, string> = {};
      const cms = hints.find((x) => CMS.includes(x)) ?? (home?.generator?.split(' ')[0]);
      const builder = hints.find((x) => BUILDERS.includes(x));
      const framework = hints.find((x) => JS_FRAMEWORKS.includes(x));
      const cdn = cdnOf(h);
      if (cms) parts.cms = cms;
      if (builder) parts.builder = builder;
      if (framework) parts.framework = framework;
      if (cdn) parts.cdn = cdn;
      if (h['server']) parts.server = h['server'];
      if (h['x-powered-by']) parts.poweredBy = h['x-powered-by'];
      const line = Object.values(parts).join(', ') || 'not detected';
      return { status: 'info', message: { client: `Built with: ${line}`, expert: `Stack: ${Object.entries(parts).map(([k, v]) => `${k}=${v}`).join('; ') || 'not detected'}` }, metrics: parts };
    },
  },
  {
    id: '1.11.3', module: 1, category: 'technical', card: 'schema', scope: 'page', severity: 'medium',
    title: { client: 'Business details in the code do not match the page', expert: 'Schema telephone not visible on the page' },
    explain: { client: 'Google trusts structured data only when it matches what visitors see.', expert: 'Schema values must reflect visible content; mismatches can void rich results.' },
    fix: { client: 'Make sure the phone number in the code matches the one on the page.', expert: 'Align schema telephone with the visible number.' },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => schemaValues(c, 'telephone').length), (c) => {
        const visible = phonesIn(c.fullText).map((d) => d.slice(-7));
        return !schemaValues(c, 'telephone').some((t) => visible.includes(t.replace(/\D/g, '').slice(-7)));
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} a phone in the code that is not on the page`, expert: `${n} pages where schema telephone is not visible` } : { client: 'Code and page details match', expert: 'Schema telephone visible on every page' }, 'warn'),
  },
  {
    id: '1.11.4', module: 1, category: 'technical', card: 'schema', scope: 'site', severity: 'medium',
    title: { client: 'Different phone numbers on the homepage', expert: 'NAP mismatch: schema vs page text' },
    explain: { client: 'Two different numbers confuse customers and Google about how to reach you.', expert: 'Consistent NAP across schema, site and citations is a local ranking factor.' },
    fix: { client: 'Use one phone number everywhere.', expert: 'Make schema telephone match the footer/header number.' },
    ice: { impact: 3, confidence: 3, effort: 1 },
    evaluate: ({ home }) => {
      if (!home) return null;
      const schema = schemaValues(home, 'telephone').map((t) => t.replace(/\D/g, '').slice(-7)).filter((t) => t.length === 7);
      const visible = phonesIn(home.fullText).map((d) => d.slice(-7));
      if (!schema.length || !visible.length) return null;
      return schema.some((t) => visible.includes(t))
        ? { status: 'pass', message: { client: 'Phone number is consistent', expert: 'Schema telephone matches page text' } }
        : { status: 'fail', affected: [home.url], message: { client: 'The phone number in the code differs from the one shown', expert: 'Schema telephone not found in homepage text' } };
    },
  },
  {
    id: '1.12.4', module: 1, category: 'technical', card: 'links', scope: 'page', severity: 'low',
    title: { client: 'No breadcrumb trail', expert: 'No breadcrumbs (markup or BreadcrumbList)' },
    explain: { client: 'Breadcrumbs show visitors and Google where a page sits on the site.', expert: 'Breadcrumbs aid hierarchy discovery and can show in SERPs.' },
    fix: { client: 'Add a breadcrumb trail at the top of inner pages.', expert: 'Add breadcrumb nav + BreadcrumbList schema on non-home templates.' },
    ice: { impact: 2, confidence: 4, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => !isHome(c)), (c) => !c.breadcrumbMarkup && !hasSchema(c, 'BreadcrumbList'), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} no breadcrumbs`, expert: `${n} inner pages without breadcrumbs` } : { client: 'Inner pages have breadcrumbs', expert: 'Breadcrumbs on every inner page' }, 'warn'),
  },
  {
    id: '1.12.6', module: 1, category: 'technical', card: 'links', scope: 'site', severity: 'medium',
    title: { client: 'Links say "click here" instead of what they lead to', expert: 'Generic internal anchor text' },
    explain: { client: 'Link words like "read more" tell Google nothing about the page they point to.', expert: 'Anchor text is a relevance signal; generic/empty anchors waste it.' },
    fix: { client: 'Use link text that names the page, like "AC repair in Dallas".', expert: 'Replace generic/empty anchors with descriptive ones.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ content }) => {
      const seen = new Set<string>();
      const links = content.flatMap(bodyLinks).filter((l) => {
        const key = `${l.href}|${l.text}`;
        return seen.has(key) ? false : (seen.add(key), true);
      });
      if (links.length < 5) return null;
      const generic = links.filter(isGenericAnchor).length;
      const pct = Math.round((generic * 100) / links.length);
      const affected = content.filter((c) => bodyLinks(c).some(isGenericAnchor)).map((c) => c.url);
      return {
        status: pct > 25 ? 'fail' : pct > 10 ? 'warn' : 'pass',
        affected: pct > 10 ? affected : [],
        applicable: content.length,
        metrics: { genericPercent: pct, links: links.length },
        message: pct > 10
          ? { client: `${pct}% of links use vague words like "read more"`, expert: `${pct}% generic/empty internal anchors (${generic}/${links.length})` }
          : { client: 'Link text is descriptive', expert: `${pct}% generic internal anchors` },
      };
    },
  },
  {
    id: '2.6.2', module: 2, category: 'onpage', card: 'links', scope: 'page', severity: 'low',
    title: { client: 'Pages with vague link text', expert: 'Pages with > 20% generic anchors' },
    explain: { client: 'Each page should describe where its links go.', expert: 'Per-page share of generic body anchors (shares data with 1.12.6).' },
    fix: { client: 'Rewrite "click here" links on these pages to say where they go.', expert: 'Rewrite generic anchors on the listed pages.' },
    ice: { impact: 2, confidence: 4, effort: 1 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => bodyLinks(c).length >= 3), (c) => {
        const l = bodyLinks(c);
        return l.filter(isGenericAnchor).length / l.length > 0.2;
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'uses' : 'use'} vague link text`, expert: `${n} pages with > 20% generic anchors` } : { client: 'Link text is descriptive on every page', expert: 'No page over 20% generic anchors' }, 'warn'),
  },
  {
    id: '1.13.1', module: 1, category: 'technical', card: 'intl', scope: 'page', severity: 'medium',
    title: { client: 'Language versions are set up incorrectly', expert: 'Invalid hreflang (codes, self-reference, absolute URLs)' },
    explain: { client: 'Language tags tell Google which version to show in each country. Mistakes show the wrong one.', expert: 'hreflang needs valid ISO codes, a self-reference and absolute URLs on every variant.' },
    fix: { client: 'Ask your developer to fix the language tags on these pages.', expert: 'Fix invalid codes, add self-referencing and x-default entries, use absolute URLs.' },
    ice: { impact: 3, confidence: 4, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => c.hreflang.length), (c) =>
        c.hreflang.some((h) => !HREFLANG.test(h.lang) || !/^https?:\/\//.test(h.href)) || !c.hreflang.some((h) => sameUrl(h.href, c.url)), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} language tag mistakes`, expert: `${n} pages with invalid hreflang` } : { client: 'Language tags are correct', expert: 'hreflang valid on every page' }),
  },
];
