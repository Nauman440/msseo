import { hasSchema, schemaValues } from './content-signals';
import type { PageContent } from './page-content';
import { contentPages } from './rules-content';
import { countPages, plural, type RuleDef } from './types';

/**
 * Social sharing, freshness and AI-answer checks (added 2026-11-26 after comparing with an SEO/GEO/AEO
 * audit checklist): Open Graph / X card tags (2.2.5), visible dates on articles (2.4.11), question-style
 * headings (2.8.5), facts and sources (2.8.6) and sameAs profiles in the business schema (1.11.5).
 */

const ARTICLE_PATH = /\/(blog|news|articles?|insights|posts?|guides?|resources|tips)\/.+/i;
const NOT_SERVICE = /\/(blog|news|article|category|tag|author|contact|about|privacy|terms|cookie|legal)(\/|$)/i;
const isHome = (c: PageContent) => new URL(c.url).pathname.replace(/\/$/, '') === '';
/** Blog posts and other articles: by address, or Article/BlogPosting/NewsArticle schema. */
export const isArticle = (c: PageContent) => ARTICLE_PATH.test(new URL(c.url).pathname) || hasSchema(c, 'Article', 'BlogPosting', 'NewsArticle');
const isService = (c: PageContent) => !isHome(c) && !isArticle(c) && !NOT_SERVICE.test(new URL(c.url).pathname);

/** A heading phrased the way people ask (ends with "?" or starts with a question word). */
export const QUESTION_HEADING = /\?\s*$|^(how|what|why|when|where|which|who|can|does|do|is|are|should|will)\b/i;

/**
 * Concrete facts an AI answer can quote: numbers with a unit, a percentage, a price, a year count or a
 * plain figure of 2+ digits (dates and phone-like strings excluded).
 */
const FACT = /(?:[$£€₹]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:%|percent|per ?cent|years?|months?|weeks?|days?|hours?|hrs?|minutes?|mins?|seconds?|kg|g|mg|lbs?|oz|cm|mm|m|km|miles?|ml|l|litres?|liters?|sq ?ft|m2|watts?|kw|kwh|btu|°[cf]?|x)\b|\b\d{2,}(?:[,.]\d+)?\s+(?:[a-z]+))/gi;
export const factCount = (text: string) => (text.replace(/\+?\d[\d\s().-]{8,}\d/g, ' ').match(FACT) ?? []).length;
/** Links in the page's own copy to other websites (not menus, header or footer). */
export const sourceLinks = (c: PageContent) => c.links.filter((l) => !l.internal && !l.inNav && /^https?:/i.test(l.href)).length;
const MIN_FACTS = 3;

export const geoRules: RuleDef[] = [
  {
    id: '2.2.5', module: 2, category: 'onpage', card: 'meta', scope: 'page', severity: 'low',
    title: { client: 'Links shared on social media look plain', expert: 'Missing Open Graph / X (Twitter) card tags' },
    explain: {
      client: 'When someone shares your page on Facebook, LinkedIn, WhatsApp or X, these tags choose the picture, title and text shown.',
      expert: 'og:title, og:description and og:image control link previews on Facebook, LinkedIn and messaging apps; twitter:card sets the X card type (X falls back to og: tags for the rest).',
    },
    fix: {
      client: 'Give every page a share title, short description and picture (most SEO plugins have a "Social" tab for this).',
      expert: 'Add og:title, og:description and og:image (1200×630) to every indexable page, plus twitter:card = summary_large_image.',
    },
    ice: { impact: 2, confidence: 4, effort: 1 },
    evaluate: ({ content }) => {
      const pages = content.filter((c) => c.status === 200 && c.openGraph && !/noindex/.test(c.robots ?? ''));
      if (!pages.length) return null;
      const missingOg = (c: PageContent) => !c.openGraph!.title || !c.openGraph!.description || !c.openGraph!.image;
      const noCard = pages.filter((c) => c.twitterCard === false).length;
      return countPages(pages, missingOg, (n) =>
        n
          ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} no share picture, title or text`, expert: `${n} pages missing og:title/og:description/og:image${noCard ? `; ${noCard} without twitter:card` : ''}` }
          : noCard
            ? { client: 'Pages have share pictures and titles', expert: `Open Graph complete; ${noCard} pages without twitter:card (X falls back to og:)` }
            : { client: 'Pages have share pictures and titles', expert: 'Open Graph and twitter:card on every page' },
        'warn');
    },
  },
  {
    id: '2.4.11', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'medium',
    title: { client: 'Articles do not show when they were written or updated', expert: 'No published/updated date on articles' },
    explain: {
      client: 'People, Google and AI assistants trust advice more when they can see it is recent.',
      expert: 'A visible date (and datePublished/dateModified in Article schema) is a freshness and trust signal used by search engines and AI answers.',
    },
    fix: {
      client: 'Show "Published" and "Last updated" dates on every blog post and update them when you revise the post.',
      expert: 'Render published/updated dates on article templates and add datePublished / dateModified to Article or BlogPosting schema.',
    },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ content }) => {
      const articles = content.filter((c) => c.status === 200 && c.dated !== undefined && isArticle(c));
      if (!articles.length) return null;
      return countPages(articles, (c) => !c.dated, (n) =>
        n ? { client: `${plural(n, 'article')} ${n === 1 ? 'shows' : 'show'} no date`, expert: `${n} articles without a published/updated date` } : { client: 'Articles show their dates', expert: 'Every article has a published or updated date' }, 'warn');
    },
  },
  {
    id: '2.8.5', module: 2, category: 'ai', card: 'aeo', scope: 'page', severity: 'low',
    title: { client: 'Headings do not ask the questions customers ask', expert: 'No question-phrased H2/H3 headings' },
    explain: {
      client: 'People type and speak questions ("How much does … cost?"). A heading that asks the question, followed by a short answer, is what Google and AI assistants quote.',
      expert: 'Question-phrased H2/H3s matched to People Also Ask and voice queries make answer blocks easy to extract for featured snippets and AI answers.',
    },
    fix: {
      client: 'Turn some section headings into the questions customers ask, and answer each in 2–3 sentences right below.',
      expert: 'Rephrase 2–3 H2/H3s per page as questions (from People Also Ask / Search Console) with a 40–60 word answer directly under each.',
    },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ content }) =>
      countPages(contentPages(content).filter((c) => c.words >= 300 && (isService(c) || isArticle(c))), (c) => !c.headings.some((h) => h.level >= 2 && h.level <= 3 && QUESTION_HEADING.test(h.text)), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} no question-style headings`, expert: `${n} pages without a question-phrased H2/H3` } : { client: 'Pages use question-style headings', expert: 'Question-phrased H2/H3 on every long page' }, 'warn'),
  },
  {
    id: '2.8.6', module: 2, category: 'ai', card: 'aeo', scope: 'page', severity: 'medium',
    title: { client: 'Pages have few facts or figures to quote', expert: 'Low factual density / no cited sources' },
    explain: {
      client: 'AI assistants prefer pages with specific facts: prices, timings, sizes, percentages, years of experience. Articles that link to trusted sources are quoted more.',
      expert: 'Generative engines favour concrete, attributable claims (numbers with units, prices, statistics); articles citing external authoritative sources are more often cited themselves.',
    },
    fix: {
      client: 'Add specific facts (how long a job takes, typical prices, guarantees in years, sizes). In blog posts, link to the official or expert sources you used.',
      expert: `Add at least ${MIN_FACTS} concrete figures per page (prices, durations, specs, %); in articles, cite 1–3 authoritative external sources inline.`,
    },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: ({ content }) => {
      const pages = contentPages(content).filter((c) => c.status === 200 && c.words >= 300 && (isService(c) || isArticle(c)));
      return countPages(pages, (c) => factCount(c.text) < MIN_FACTS || (isArticle(c) && sourceLinks(c) === 0), (n) =>
        n
          ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} few facts or sources`, expert: `${n} pages with < ${MIN_FACTS} concrete figures, or articles citing no external source` }
          : { client: 'Pages give specific facts', expert: 'Every long page has concrete figures; articles cite sources' },
        'warn');
    },
  },
  {
    id: '1.11.5', module: 1, category: 'technical', card: 'schema', scope: 'site', severity: 'low',
    title: { client: 'Your business profiles are not linked to your website for Google and AI', expert: 'No sameAs profiles in Organization/LocalBusiness schema' },
    explain: {
      client: 'Listing your social and business profiles in the site’s hidden business details helps Google and AI assistants know they all belong to you.',
      expert: 'sameAs links (Google Business Profile, Facebook, LinkedIn, Instagram, Wikidata…) in Organization/LocalBusiness schema connect the brand entity across the web.',
    },
    fix: {
      client: 'Add links to your Google Business Profile and social pages to the business details (schema) on your homepage.',
      expert: 'Add a sameAs array with the official profile URLs to the homepage Organization or LocalBusiness JSON-LD.',
    },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ home }) => {
      if (!home || home.status !== 200) return null;
      const urls = schemaValues(home, 'sameAs').filter((u) => /^https?:\/\//i.test(u));
      if (urls.length) return { status: 'pass', message: { client: 'Your profiles are linked in the business details', expert: `sameAs lists ${plural(urls.length, 'profile')}` }, metrics: { profiles: urls.length } };
      const org = home.schemaTypes.some((t) => /Organization|LocalBusiness|Store|Business|Contractor|Plumber|Electrician|Dentist|Restaurant/.test(t));
      return {
        status: 'warn',
        affected: [home.url],
        applicable: 1,
        message: org
          ? { client: 'Your business details do not list your profiles', expert: 'Organization/LocalBusiness schema has no sameAs' }
          : { client: 'Your homepage has no business details for Google, so no profiles are linked', expert: 'No Organization/LocalBusiness schema (and no sameAs) on the homepage' },
      };
    },
  },
];
