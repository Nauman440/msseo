import { containsAll, hasSchema, keywordTerm, mainTerm, readability, termDensity, termResolver } from './content-signals';
import type { PageContent } from './page-content';
import { countPages, plural, type RuleDef } from './types';

/** Module 2 rules read from each page's own HTML (spec §6.3). */

const SHORT_OK = /\/(contact|privacy|terms|cookie|legal|sitemap|login|cart|checkout|thank)/i;
const withTerm = (pages: PageContent[]) => pages.filter((c) => mainTerm(c).length > 0);
const first100 = (c: PageContent) => c.text.split(/\s+/).slice(0, 100).join(' ');
const OLD_YEAR = new Date().getFullYear() - 2;
const YEARS = /\b(19[89]\d|20[0-4]\d)\b/g;
const CTA_HEADING = /^(call( us)?( now| today)?|get (a )?(free )?quote|contact us|book( now)?|order now|learn more|read more|click here|[+\d][\d\s().-]{6,})$/i;
const CAMERA_NAME = /^(img|dsc|dscn|dcim|image|photo|pic|picture|screenshot|untitled|whatsapp image)[-_ ]?\d*/i;

const fileName = (src: string) => decodeURIComponent(src.split('?')[0]!.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');

export const contentRules: RuleDef[] = [
  {
    id: '2.1.4', module: 2, category: 'onpage', card: 'titles', scope: 'page', severity: 'low',
    title: { client: 'The main topic is not near the start of the title', expert: 'Primary keyword not in the first 30 title characters' },
    explain: { client: 'People scan the first words of a search result. Put what the page is about first.', expert: 'Front-loaded keywords match intent faster and survive SERP truncation. Phase 1 infers the term from the URL slug or H1.' },
    fix: { client: 'Start each title with the service or topic of the page.', expert: 'Move the primary term into the first 30 characters of the <title>.' },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ content, data }) => {
      const { term, source } = termResolver(data.gsc, data.pageKeywords);
      const from = source === 'mapping' ? 'mapped primary keyword' : source === 'gsc' ? 'top Search Console query' : 'slug/H1 term';
      return countPages(content.filter((c) => c.title && term(c).length), (c) => !(c.title ?? '').slice(0, 30).toLowerCase().includes(term(c)[0]!), (n) =>
        n ? { client: `${plural(n, 'title')} put the main topic too late`, expert: `${n} titles lack the ${from} in the first 30 chars` } : { client: 'Titles lead with the topic', expert: `${source === 'gsc' ? 'Top query' : source === 'mapping' ? 'Mapped keyword' : 'Primary term'} in the first 30 chars of every title` }, 'warn');
    },
  },
  {
    id: '2.2.4', module: 2, category: 'onpage', card: 'meta', scope: 'page', severity: 'low',
    title: { client: 'Search snippets do not mention the topic', expert: 'Primary keyword missing from meta description' },
    explain: { client: 'Google highlights the words people searched for in the snippet, which draws the eye.', expert: 'Query terms are bolded in snippets, lifting CTR.' },
    fix: { client: 'Mention the main service in each page’s snippet text.', expert: 'Include the primary term in the meta description.' },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ content, data }) => {
      const { term, source } = termResolver(data.gsc, data.pageKeywords);
      return countPages(content.filter((c) => c.description && term(c).length), (c) => !containsAll(c.description ?? '', term(c)), (n) =>
        n ? { client: `${plural(n, 'snippet')} ${n === 1 ? 'does' : 'do'} not mention the page topic`, expert: `${n} meta descriptions lack the ${source === 'gsc' ? 'top Search Console query' : source === 'mapping' ? 'mapped primary keyword' : 'primary term'}` } : { client: 'Snippets mention the page topic', expert: 'Primary term in every meta description' }, 'warn');
    },
  },
  {
    id: '2.3.2', module: 2, category: 'onpage', card: 'headings', scope: 'page', severity: 'low',
    title: { client: 'The main heading does not match the page topic', expert: 'H1 does not share the title/URL topic' },
    explain: { client: 'The main heading tells visitors and Google what the page is about. It should match the title.', expert: 'H1 should reinforce the title/slug topic.' },
    fix: { client: 'Make the main heading say what the page offers.', expert: 'Align the H1 with the title and URL topic.' },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ content, data }) => {
      const term = keywordTerm(data.pageKeywords);
      return countPages(content.filter((c) => c.h1.length && term(c).length), (c) => !term(c).some((t) => c.h1[0]!.toLowerCase().includes(t)), (n) =>
        n ? { client: `${plural(n, 'main heading')} ${n === 1 ? 'does' : 'do'} not match the page topic`, expert: `${n} H1s share no term with the page's keyword (mapped, else slug/title)` } : { client: 'Main headings match their pages', expert: 'Every H1 shares the page topic' }, 'warn');
    },
  },
  {
    id: '2.3.3', module: 2, category: 'onpage', card: 'headings', scope: 'page', severity: 'low',
    title: { client: 'Headings are out of order', expert: 'Skipped or out-of-order heading levels' },
    explain: { client: 'Headings should go from big to small, like chapters and sections, so the page is easy to follow.', expert: 'Skipped levels (H1→H3) or H2 before H1 weaken document outline and accessibility.' },
    fix: { client: 'Use headings in order: one main heading, then sub-headings.', expert: 'Fix the outline: no skipped levels, H1 first.' },
    ice: { impact: 1, confidence: 4, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => c.headings.length > 1), (c) => {
        const firstH1 = c.headings.findIndex((h) => h.level === 1);
        if (firstH1 > 0 && c.headings.slice(0, firstH1).some((h) => h.level >= 2)) return true;
        return c.headings.some((h, i) => i > 0 && h.level > c.headings[i - 1]!.level + 1);
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} headings out of order`, expert: `${n} pages with skipped/out-of-order heading levels` } : { client: 'Headings are in order', expert: 'Heading outlines are sequential' }, 'warn'),
  },
  {
    id: '2.3.5', module: 2, category: 'onpage', card: 'headings', scope: 'page', severity: 'low',
    title: { client: 'Headings used just for big text', expert: 'Headings used for styling (CTAs, phone numbers)' },
    explain: { client: 'Headings like "Call now" or a phone number confuse Google about what the page is about.', expert: 'Short CTA/phone headings dilute the outline; style them with CSS instead.' },
    fix: { client: 'Turn buttons and phone numbers into normal text, not headings.', expert: 'Replace CTA/phone <hN> with styled text.' },
    ice: { impact: 1, confidence: 4, effort: 1 },
    evaluate: ({ content }) =>
      countPages(content, (c) => c.headings.some((h) => h.level > 1 && CTA_HEADING.test(h.text)), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'uses' : 'use'} headings for buttons or phone numbers`, expert: `${n} pages with CTA/phone headings` } : { client: 'Headings are real headings', expert: 'No CTA/phone headings' }, 'warn'),
  },
  {
    id: '2.4.3', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'medium',
    title: { client: 'The topic is not mentioned early in the text', expert: 'Primary keyword missing from the first 100 words' },
    explain: { client: 'Saying what the page is about in the first lines reassures visitors and Google.', expert: 'Early term usage confirms relevance and feeds snippets.' },
    fix: { client: 'Mention the main service in the opening sentence.', expert: 'Use the primary term within the first 100 words.' },
    ice: { impact: 2, confidence: 3, effort: 1 },
    evaluate: ({ content, data }) => {
      const term = keywordTerm(data.pageKeywords);
      return countPages(content.filter((c) => c.words >= 100 && term(c).length), (c) => !containsAll(first100(c), term(c)), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'does' : 'do'} not mention the topic early`, expert: `${n} pages lack the primary term in the first 100 words` } : { client: 'Pages mention their topic early', expert: 'Primary term in the first 100 words' }, 'warn');
    },
  },
  {
    id: '2.4.6', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'low',
    title: { client: 'Keywords repeated too often', expert: 'Keyword stuffing' },
    explain: { client: 'Repeating the same phrase over and over reads badly and can be ignored by Google.', expert: 'Main-term density > 4% or ≥ 15 repetitions looks manipulative.' },
    fix: { client: 'Write naturally and use related words instead of repeating one phrase.', expert: 'Reduce repetitions; use variants and related terms.' },
    ice: { impact: 2, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      countPages(withTerm(content).filter((c) => c.words >= 150), (c) => {
        const d = termDensity(c.text, mainTerm(c));
        return d.percent > 4 || d.count >= 15;
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'repeats' : 'repeat'} the same phrase too often`, expert: `${n} pages over 4% density or ≥ 15 repetitions` } : { client: 'No keyword stuffing', expert: 'Term density within limits' }, 'warn'),
  },
  {
    id: '2.4.8', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'low',
    title: { client: 'Text is hard to read', expert: 'Low readability (Flesch < 50 or long sentences)' },
    explain: { client: 'Long, complicated sentences make visitors leave before they call.', expert: 'Flesch reading ease < 50 or > 25 words per sentence.' },
    fix: { client: 'Use shorter sentences and everyday words.', expert: 'Shorten sentences; simplify vocabulary.' },
    ice: { impact: 2, confidence: 3, effort: 3 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => readability(c.text)), (c) => {
        const r = readability(c.text)!;
        return r.flesch < 50 || r.avgSentence > 25;
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'is' : 'are'} hard to read`, expert: `${n} pages with Flesch < 50 or > 25 words/sentence` } : { client: 'Text is easy to read', expert: 'Readability within limits' }, 'warn'),
  },
  {
    id: '2.4.10', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'medium',
    title: { client: 'Pages show outdated dates or facts', expert: 'Outdated years or facts' },
    explain: { client: 'Old years in headings or mentions of phased-out products (like R-22) make a business look inactive.', expert: `Years ≤ ${OLD_YEAR} in titles/headings, or "R-22", signal stale content.` },
    fix: { client: 'Update old years and outdated details.', expert: 'Refresh dated titles/headings and obsolete references.' },
    ice: { impact: 3, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content, (c) => {
        const head = [c.title ?? '', ...c.headings.map((h) => h.text)].join(' ');
        const oldYear = [...head.matchAll(YEARS)].some((m) => Number(m[1]) <= OLD_YEAR);
        return oldYear || /\bR-?22\b/.test(c.text);
      }, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'shows' : 'show'} outdated dates or facts`, expert: `${n} pages with years ≤ ${OLD_YEAR} in title/headings or R-22` } : { client: 'No outdated dates found', expert: 'No stale years in titles/headings' }, 'warn'),
  },
  {
    id: '2.5.1', module: 2, category: 'onpage', card: 'images', scope: 'page', severity: 'low',
    title: { client: 'Image file names say nothing', expert: 'Non-descriptive image file names' },
    explain: { client: 'Names like IMG_1234.jpg tell Google nothing; describing the photo helps image search.', expert: 'Camera/hash file names miss image-search relevance.' },
    fix: { client: 'Rename images to describe them, like ac-repair-technician.jpg.', expert: 'Use descriptive, hyphenated file names.' },
    ice: { impact: 1, confidence: 4, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => c.images.length), (c) => c.images.some((i) => {
        const n = fileName(i.src);
        return CAMERA_NAME.test(n) || /^[0-9a-f]{16,}$/i.test(n) || /^\d+$/.test(n);
      }), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} images with meaningless names`, expert: `${n} pages with IMG_/DSC/hash file names` } : { client: 'Image names are descriptive', expert: 'No camera/hash image names' }, 'warn'),
  },
  {
    id: '2.5.5', module: 2, category: 'onpage', card: 'images', scope: 'page', severity: 'low',
    title: { client: 'Videos are not described for Google', expert: 'Video without VideoObject schema or transcript' },
    explain: { client: 'Google cannot watch videos; a description or transcript lets them appear in search.', expert: 'Embedded video needs VideoObject schema or a transcript to be indexed.' },
    fix: { client: 'Add a short description or transcript under each video.', expert: 'Add VideoObject schema and/or a transcript.' },
    ice: { impact: 1, confidence: 3, effort: 2 },
    evaluate: ({ content }) =>
      countPages(content.filter((c) => c.videos > 0), (c) => !hasSchema(c, 'VideoObject') && !/transcript/i.test(c.text), (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} videos Google cannot read`, expert: `${n} pages with video but no VideoObject/transcript` } : { client: 'Videos are described', expert: 'Videos have schema or transcript' }, 'warn'),
  },
];

/** Pages that should have substantial copy (excludes contact/legal/utility). */
export const contentPages = (pages: PageContent[]) => pages.filter((c) => !SHORT_OK.test(new URL(c.url).pathname));
