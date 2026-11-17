import { CREDENTIALS, hasSchema, phonesIn, PRICE, REVIEWS, schemaValues, TRUST } from './content-signals';
import { wordCount, type PageContent } from './page-content';
import { contentPages } from './rules-content';
import { countPages, plural, type Evaluation, type RuleDef } from './types';

/** Trust, conversion and AI-readiness rules (spec §6.3: 2.7.x, 2.8.x). */

const ADDRESS = /\b\d{1,5}\s+[\p{L}0-9.'-]+(?:\s+[\p{L}0-9.'-]+){0,4}\s+(street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way|court|ct|suite|plaza|block|sector|floor)\b/iu;
const ABOUT = /\/(about|about-us|team|our-team|our-story|who-we-are|company)(\/|$)/i;
const NOT_SERVICE = /\/(blog|news|article|category|tag|author|contact|about|privacy|terms|cookie|legal)(\/|$)/i;

/** Site-scope helper: pass when any page shows the signal, else `status`. */
function anyPage(pages: PageContent[], test: (c: PageContent) => boolean, pass: Evaluation['message'], missing: Evaluation['message'], status: 'warn' | 'fail' = 'warn'): Evaluation | null {
  if (!pages.length) return null;
  const hits = pages.filter(test).map((c) => c.url);
  return hits.length
    ? { status: 'pass', message: pass, metrics: { pages: hits.length } }
    : { status, message: missing, affected: pages.map((c) => c.url), applicable: pages.length };
}

const isHome = (c: PageContent) => new URL(c.url).pathname.replace(/\/$/, '') === '';
/**
 * An online shop (Shopify, product schema, or cart/checkout links): customers buy on the site,
 * so "tap to call" is not expected the way it is for a local service business.
 */
export const isOnlineShop = (pages: PageContent[]) =>
  pages.some((c) => c.hints.includes('shopify') || c.schemaTypes.some((t) => t === 'Product' || t === 'Offer') || c.links.some((l) => l.internal && /\/(cart|checkout|basket)(\/|$)/.test(new URL(l.href).pathname)));
/** Pages that are neither home nor blog/contact/legal: the best phase-1 guess at service pages. */
const servicePages = (pages: PageContent[]) => pages.filter((c) => !isHome(c) && !NOT_SERVICE.test(new URL(c.url).pathname));

export const trustRules: RuleDef[] = [
  {
    id: '2.7.1', module: 2, category: 'trust', card: 'trust', scope: 'site', severity: 'medium',
    title: { client: 'No reviews or testimonials shown', expert: 'No review/testimonial signals on the site' },
    explain: { client: 'Most people check reviews before they call. Showing them builds trust straight away.', expert: 'Review widgets, testimonials or Review/AggregateRating schema support E-E-A-T and conversion.' },
    fix: { client: 'Add customer reviews to the homepage and service pages.', expert: 'Embed reviews/testimonials; add AggregateRating where policy allows.' },
    ice: { impact: 4, confidence: 4, effort: 2 },
    evaluate: ({ content, home }) =>
      anyPage(home ? [home] : content, (c) => REVIEWS.test(c.fullText) || hasSchema(c, 'Review', 'AggregateRating'),
        { client: 'Reviews are shown', expert: 'Review signals found' }, { client: 'No reviews or testimonials found', expert: 'No review text, widget or schema on the homepage' }),
  },
  {
    id: '2.7.2', module: 2, category: 'trust', card: 'trust', scope: 'site', severity: 'high',
    title: { client: 'No licences, insurance or guarantees mentioned', expert: 'No licence/insurance/guarantee signals' },
    explain: { client: 'Customers want to know you are licensed, insured and stand behind your work.', expert: 'Credentials and guarantees are core trust signals for local service businesses.' },
    fix: { client: 'Mention your licences, insurance and guarantees on every service page and in the footer.', expert: 'Add licence numbers, insurance, warranty and certification copy (site-wide footer + service templates).' },
    ice: { impact: 4, confidence: 4, effort: 1 },
    evaluate: ({ content }) =>
      anyPage(content, (c) => TRUST.test(c.fullText),
        { client: 'Licences or guarantees are mentioned', expert: 'Licence/insurance/guarantee copy found' }, { client: 'No licences, insurance or guarantees mentioned', expert: 'No TRUST pattern on any checked page' }, 'fail'),
  },
  {
    id: '2.7.3', module: 2, category: 'trust', card: 'trust', scope: 'site', severity: 'medium',
    title: { client: 'Business details are hard to find', expert: 'Missing phone, address or about page' },
    explain: { client: 'A phone number, address and about page show you are a real, local business.', expert: 'Visible NAP and an about/team page are identity signals for users and quality raters.' },
    fix: { client: 'Show your phone and address in the footer and add an About page.', expert: 'Add NAP to the footer and link an about/team page from navigation.' },
    ice: { impact: 3, confidence: 4, effort: 1 },
    evaluate: ({ content, home }) => {
      if (!home) return null;
      const all = [home, ...content];
      const missing: string[] = [];
      if (!home.telLinks && !phonesIn(home.fullText).length) missing.push('phone');
      if (!ADDRESS.test(home.fullText) && !schemaValues(home, 'streetAddress').length) missing.push('address');
      if (!all.some((c) => ABOUT.test(new URL(c.url).pathname) || c.links.some((l) => l.internal && ABOUT.test(new URL(l.href).pathname)))) missing.push('about page');
      if (!missing.length) return { status: 'pass', message: { client: 'Phone, address and about page are shown', expert: 'Phone, address and about page found' } };
      return {
        status: missing.length > 1 ? 'fail' : 'warn',
        message: { client: `Missing from the site: ${missing.join(', ')}`, expert: `Not found: ${missing.join(', ')}` },
        affected: [home.url],
        metrics: { missing: missing.join(', ') },
      };
    },
  },
  {
    id: '2.7.4', module: 2, category: 'trust', card: 'trust', scope: 'site', severity: 'low',
    title: { client: 'No prices shown', expert: 'No pricing on service pages' },
    explain: { client: 'Even a "from" price helps people decide to call you instead of a competitor.', expert: 'Price anchors qualify leads and match "cost" intent queries.' },
    fix: { client: 'Show starting prices or price ranges on service pages.', expert: 'Add "from" pricing or ranges on service templates.' },
    ice: { impact: 2, confidence: 3, effort: 2 },
    evaluate: ({ content }) => {
      const pages = servicePages(content);
      return anyPage(pages.length ? pages : content, (c) => PRICE.test(c.text),
        { client: 'Prices are shown', expert: 'Currency/pricing patterns found' }, { client: 'No prices shown on service pages', expert: 'No currency/pricing pattern on service pages' });
    },
  },
  {
    id: '2.7.6', module: 2, category: 'mobile', card: 'mobile', scope: 'site', severity: 'medium',
    title: { client: 'Hard to call or enquire on a phone', expert: 'No click-to-call link or short form' },
    explain: { client: 'Mobile visitors want to tap to call or send a quick message.', expert: 'tel: links site-wide and a ≤ 5-field form reduce mobile friction.' },
    fix: { client: 'Make your phone number tappable on every page and keep the contact form short.', expert: 'Add a tel: link in the header; trim forms to ≤ 5 fields.' },
    ice: { impact: 4, confidence: 4, effort: 1 },
    evaluate: ({ content }) => {
      if (!content.length || isOnlineShop(content)) return null;
      const noTel = content.filter((c) => !c.telLinks).map((c) => c.url);
      const shortForm = content.some((c) => c.forms.some((f) => f.fields > 0 && f.fields <= 5));
      const missing = [noTel.length ? `click-to-call on ${plural(noTel.length, 'page')}` : '', shortForm ? '' : 'a short form'].filter(Boolean);
      if (!missing.length) return { status: 'pass', message: { client: 'Tap-to-call and a short form are available', expert: 'tel: on every page; short form present' } };
      return {
        status: noTel.length === content.length && !shortForm ? 'fail' : 'warn',
        affected: noTel,
        applicable: content.length,
        message: { client: `Missing: ${missing.join(' and ')}`, expert: `Missing: ${missing.join('; ')}` },
      };
    },
  },
  {
    id: '2.8.1', module: 2, category: 'ai', card: 'aeo', scope: 'page', severity: 'high',
    title: { client: 'Pages do not answer the question straight away', expert: 'No 40–80 word direct answer after the H1' },
    explain: { client: 'AI assistants and Google quote short, clear answers near the top of a page.', expert: 'A 40–80 word paragraph right after the H1 is the most extractable answer block.' },
    fix: { client: 'Start each page with a short paragraph that answers what the visitor came for.', expert: 'Add a 40–80 word summary paragraph directly under the H1.' },
    ice: { impact: 4, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      countPages(contentPages(content).filter((c) => c.h1.length), (c) => {
        const n = c.firstParagraph ? wordCount(c.firstParagraph) : 0;
        return n < 40 || n > 80;
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'does' : 'do'} not open with a clear answer`, expert: `${n} pages without a 40–80 word first paragraph` } : { client: 'Pages open with a clear answer', expert: 'Direct-answer paragraph on every page' }, 'warn'),
  },
  {
    id: '2.8.2', module: 2, category: 'ai', card: 'aeo', scope: 'page', severity: 'high',
    title: { client: 'Service pages have no FAQ', expert: 'No FAQ section or FAQPage schema on service pages' },
    explain: { client: 'Questions and answers match how people ask AI assistants and voice search.', expert: 'FAQ blocks map to PAA/AI query patterns and are easy to extract.' },
    fix: { client: 'Add 4–6 common customer questions with short answers to each service page.', expert: 'Add an FAQ section (and FAQPage schema) to service templates.' },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      countPages(servicePages(content), (c) => !c.faqMarkup && !hasSchema(c, 'FAQPage'), (n) =>
        n ? { client: `${plural(n, 'service page')} ${n === 1 ? 'has' : 'have'} no FAQ`, expert: `${n} service pages without FAQ section/schema` } : { client: 'Service pages have FAQs', expert: 'FAQ on every service page' }, 'warn'),
  },
  {
    id: '2.8.3', module: 2, category: 'ai', card: 'aeo', scope: 'page', severity: 'medium',
    title: { client: 'Long pages have no lists or tables', expert: 'No lists/tables in main content' },
    explain: { client: 'Bullet points, steps and tables are easier to scan and easier for AI to quote.', expert: 'Structured <ul>/<ol>/<table> content is preferred for extraction.' },
    fix: { client: 'Break long text into bullet points, steps or a comparison table.', expert: 'Add lists/tables to long-form service content.' },
    ice: { impact: 2, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      countPages(contentPages(content).filter((c) => c.words >= 300), (c) => c.lists + c.tables === 0, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} one long block of text`, expert: `${n} pages ≥ 300 words with no list/table` } : { client: 'Long pages use lists or tables', expert: 'Lists/tables present on long pages' }, 'warn'),
  },
  {
    id: '2.8.4', module: 2, category: 'ai', card: 'aeo', scope: 'site', severity: 'medium',
    title: { client: 'No experience or credentials shown', expert: 'No author/technician credentials' },
    explain: { client: 'Showing who does the work and their experience makes your advice more trustworthy.', expert: 'Author boxes, bios and certifications support E-E-A-T and AI citation.' },
    fix: { client: 'Add a short bio of your team or technicians with their experience.', expert: 'Add author/technician bios and Person schema on blog and service pages.' },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      anyPage(content, (c) => CREDENTIALS.test(c.fullText) || hasSchema(c, 'Person'),
        { client: 'Experience or credentials are shown', expert: 'Credential/author signals found' }, { client: 'No team experience or credentials shown', expert: 'No author/bio/credential signals' }),
  },
];
