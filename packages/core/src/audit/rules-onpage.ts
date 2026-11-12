import type { OnPagePage } from '../providers/dataforseo';
import { countPages, plural, type RuleDef } from './types';

const titleLen = (p: OnPagePage) => p.meta?.title_length ?? p.meta?.title?.length ?? 0;
const descLen = (p: OnPagePage) => p.meta?.description_length ?? p.meta?.description?.length ?? 0;
const h1Count = (p: OnPagePage) => p.meta?.htags?.h1?.length ?? 0;
const words = (p: OnPagePage) => p.meta?.content?.plain_text_word_count ?? 0;
/** Contact, legal and utility pages are naturally short. */
const SHORT_OK = /\/(contact|privacy|terms|cookie|legal|sitemap|login|cart|checkout|thank)/i;

/** Module 2 rules evaluated from the DataForSEO crawl (§6.3). */
export const onpageRules: RuleDef[] = [
  {
    id: '2.1.1', module: 2, category: 'onpage', card: 'titles', scope: 'page', severity: 'high',
    title: { client: 'Pages have no title', expert: 'Missing <title>' },
    explain: { client: 'The title is the blue headline in Google results — without it Google guesses.', expert: 'Title is the strongest on-page relevance signal and SERP headline.' },
    fix: { client: 'Write a unique title for each page.', expert: 'Add a unique, descriptive <title> to every indexable page.' },
    ice: { impact: 4, confidence: 5, effort: 1 },
    evaluate: ({ ok }) => countPages(ok, (p) => !p.meta?.title, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} no title`, expert: `${n} pages missing <title>` } : { client: 'Every page has a title', expert: '<title> present on all 200 pages' }),
  },
  {
    id: '2.1.2', module: 2, category: 'onpage', card: 'titles', scope: 'page', severity: 'high',
    title: { client: 'Pages share the same title', expert: 'Duplicate <title>' },
    explain: { client: 'When pages share a title, Google can’t tell which one to show.', expert: 'Duplicate titles cause cannibalisation and weak CTR.' },
    fix: { client: 'Give every page its own title.', expert: 'Deduplicate titles; include the page’s primary topic and location.' },
    ice: { impact: 3, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => p.duplicate_title === true, (n) =>
      n ? { client: `${plural(n, 'page')} share${n === 1 ? 's' : ''} a title with another page`, expert: `${n} URLs with duplicate titles` } : { client: 'Every title is unique', expert: '0 duplicate titles' }),
  },
  {
    id: '2.1.3', module: 2, category: 'onpage', card: 'titles', scope: 'page', severity: 'medium',
    title: { client: 'Titles are too short or too long', expert: 'Title length outside 50–60 characters' },
    explain: { client: 'Long titles get cut off in Google; short ones waste space.', expert: 'Titles > 60 chars truncate; < 50 under-use the SERP line.' },
    fix: { client: 'Aim for 50–60 characters per title.', expert: 'Rewrite titles to 50–60 characters.' },
    ice: { impact: 2, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok.filter((p) => p.meta?.title), (p) => titleLen(p) < 50 || titleLen(p) > 60, (n, total) =>
      n ? { client: `${n} of ${total} titles are too short or too long`, expert: `${n}/${total} titles outside 50–60 chars` } : { client: 'Title lengths are right', expert: 'All titles 50–60 chars' }, 'warn'),
  },
  {
    id: '2.2.1', module: 2, category: 'onpage', card: 'meta', scope: 'page', severity: 'medium',
    title: { client: 'Pages have no search snippet text', expert: 'Missing meta description' },
    explain: { client: 'This is the grey text under the title in Google — it persuades people to click.', expert: 'Missing descriptions let Google auto-generate snippets, often poorly.' },
    fix: { client: 'Write a short summary for each page.', expert: 'Add unique 140–160 char meta descriptions with benefit + CTA.' },
    ice: { impact: 3, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => !p.meta?.description, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} no search snippet text`, expert: `${n} pages missing meta description` } : { client: 'Every page has snippet text', expert: 'Meta description on all 200 pages' }),
  },
  {
    id: '2.2.1-b', module: 2, category: 'onpage', card: 'meta', scope: 'page', severity: 'medium',
    title: { client: 'Pages share the same snippet text', expert: 'Duplicate meta descriptions' },
    explain: { client: 'Identical snippets make pages look the same in Google.', expert: 'Duplicate descriptions reduce SERP differentiation.' },
    fix: { client: 'Write a different summary for each page.', expert: 'Deduplicate meta descriptions.' },
    ice: { impact: 2, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok, (p) => p.duplicate_description === true, (n) =>
      n ? { client: `${plural(n, 'page')} share${n === 1 ? 's' : ''} snippet text with another page`, expert: `${n} duplicate meta descriptions` } : { client: 'Snippet texts are unique', expert: '0 duplicate descriptions' }, 'warn'),
  },
  {
    id: '2.2.2', module: 2, category: 'onpage', card: 'meta', scope: 'page', severity: 'low',
    title: { client: 'Snippet text is too short or too long', expert: 'Meta description outside 140–160 characters' },
    explain: { client: 'Snippets that are too long get cut off.', expert: 'Descriptions truncate past ~160 characters.' },
    fix: { client: 'Aim for 140–160 characters.', expert: 'Rewrite to 140–160 characters.' },
    ice: { impact: 1, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok.filter((p) => p.meta?.description), (p) => descLen(p) < 140 || descLen(p) > 160, (n, total) =>
      n ? { client: `${n} of ${total} snippets are too short or too long`, expert: `${n}/${total} descriptions outside 140–160 chars` } : { client: 'Snippet lengths are right', expert: 'All descriptions 140–160 chars' }, 'warn'),
  },
  {
    id: '2.3.1', module: 2, category: 'onpage', card: 'headings', scope: 'page', severity: 'medium',
    title: { client: 'Pages have no main heading or several', expert: 'H1 missing or multiple' },
    explain: { client: 'Each page should have one clear main heading saying what it is about.', expert: 'Exactly one H1 aligned with the title clarifies topic.' },
    fix: { client: 'Use one main heading per page.', expert: 'Ensure exactly one H1 per page.' },
    ice: { impact: 2, confidence: 5, effort: 1 },
    evaluate: ({ ok }) => {
      const none = ok.filter((p) => h1Count(p) === 0).length;
      const many = ok.filter((p) => h1Count(p) > 1).length;
      const r = countPages(ok, (p) => h1Count(p) !== 1, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} no main heading or several`, expert: `${none} pages with 0 H1, ${many} with > 1 H1` } : { client: 'Every page has one main heading', expert: 'Exactly one H1 on all pages' }, 'warn');
      return r;
    },
  },
  {
    id: '2.4.9', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'high',
    title: { client: 'Pages have very little text', expert: 'Thin content (< 300 words)' },
    explain: { client: 'Pages with little text rarely rank — Google needs content to understand them.', expert: 'Thin pages underperform and can drag site quality.' },
    fix: { client: 'Add helpful detail to these pages.', expert: 'Expand to 300+ useful words or consolidate.' },
    ice: { impact: 3, confidence: 4, effort: 4 },
    evaluate: ({ ok }) => countPages(ok.filter((p) => !SHORT_OK.test(p.url)), (p) => words(p) < 300, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} very little text`, expert: `${n} pages < 300 words` } : { client: 'Pages have enough text', expert: 'All content pages ≥ 300 words' }),
  },
  {
    id: '2.4.7', module: 2, category: 'onpage', card: 'content', scope: 'page', severity: 'critical',
    title: { client: 'Pages copy each other', expert: 'Duplicate content' },
    explain: { client: 'When pages are nearly identical, Google may ignore most of them.', expert: 'Near-duplicate pages compete and get filtered.' },
    fix: { client: 'Rewrite these pages so each is unique.', expert: 'Differentiate or canonicalise duplicate pages.' },
    ice: { impact: 5, confidence: 4, effort: 4 },
    evaluate: ({ ok }) => countPages(ok, (p) => p.duplicate_content === true, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'copies' : 'copy'} another page`, expert: `${n} pages flagged duplicate_content` } : { client: 'No copied pages', expert: '0 duplicate-content pages' }),
  },
  {
    id: '2.5.2', module: 2, category: 'onpage', card: 'images', scope: 'page', severity: 'medium',
    title: { client: 'Images have no description', expert: 'Images missing alt text' },
    explain: { client: 'Image descriptions help Google and people using screen readers.', expert: 'Alt text drives image search and accessibility.' },
    fix: { client: 'Describe each image in a few words.', expert: 'Add descriptive alt to content images.' },
    ice: { impact: 2, confidence: 5, effort: 2 },
    evaluate: ({ ok }) => countPages(ok.filter((p) => (p.meta?.images_count ?? 1) > 0), (p) => p.checks?.no_image_alt === true, (n) =>
      n ? { client: `${plural(n, 'page')} ${n === 1 ? 'has' : 'have'} images with no description`, expert: `${n} pages with images missing alt` } : { client: 'Images have descriptions', expert: 'All images have alt' }),
  },
];
