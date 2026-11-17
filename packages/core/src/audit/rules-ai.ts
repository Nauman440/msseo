import type { Category } from '../types';
import type { PageCheck, VisualCheck } from './ai-checks';
import { parityGap } from './mobile-parity';
import { countPages, pathOf, plural, type CardId, type Evaluation, type RuleDef } from './types';

/**
 * Step 7: AI-judged rules (method 'ai'), manual checklist items (method 'manual', shown in
 * Expert mode only) and rule 1.9.3 (mobile vs desktop parity, automatic).
 */

type Meta = Pick<RuleDef, 'id' | 'module' | 'category' | 'card' | 'severity' | 'title' | 'explain' | 'fix' | 'ice'>;

/** A page-level AI rule: warn/fail per judged key page, with the AI's note as the explanation. */
function aiPageRule(meta: Meta, check: PageCheck): RuleDef {
  return {
    ...meta,
    method: 'ai',
    scope: 'page',
    evaluate: ({ data }): Evaluation | null => {
      const pages = data.ai?.pages ?? [];
      if (!pages.length) return null;
      const bad = pages.filter((p) => p.checks[check].verdict !== 'pass');
      if (!bad.length) {
        return { status: 'pass', applicable: pages.length, affected: [], message: { client: `${plural(pages.length, 'key page')} checked: no problems`, expert: `AI review of ${pages.length} key pages: all pass` } };
      }
      const first = bad[0]!;
      return {
        status: bad.some((p) => p.checks[check].verdict === 'fail') ? 'fail' : 'warn',
        affected: bad.map((p) => p.url),
        applicable: pages.length,
        message: { client: `${plural(bad.length, 'key page')} of ${pages.length} could do better`, expert: `AI review: ${bad.length}/${pages.length} key pages flagged` },
        sub: { client: first.checks[check].note, expert: `${pathOf(first.url)} (${first.type}): ${first.checks[check].note}` },
      };
    },
  };
}

/** A homepage-screenshot AI rule; without AI it becomes a manual check (Expert only). */
function aiVisualRule(meta: Meta, check: VisualCheck, manual: { client: string; expert: string }): RuleDef {
  return {
    ...meta,
    method: 'ai',
    scope: 'site',
    evaluate: ({ data }): Evaluation => {
      const v = data.ai?.visual;
      if (!v) return { status: 'manual', message: manual };
      const r = v[check];
      return {
        status: r.verdict,
        affected: r.verdict === 'pass' ? [] : [v.url],
        message: { client: r.note, expert: `Mobile screenshot (AI): ${r.note}` },
      };
    },
  };
}

const ai = (id: string, category: Category, card: CardId, severity: RuleDef['severity'], title: Meta['title'], explain: Meta['explain'], fix: Meta['fix'], ice: Meta['ice']): Meta => ({
  id, module: 2, category, card, severity, title, explain, fix, ice,
});

export const aiRules: RuleDef[] = [
  aiPageRule(ai('2.1.6', 'onpage', 'titles', 'low',
    { client: 'Titles do not give people a reason to click', expert: 'Title earns the click (benefit, offer, proof)' },
    { client: 'A title that promises something (fast, local, guaranteed, priced) wins more clicks than a plain label.', expert: 'AI judgement of benefit/offer/proof/location in the title.' },
    { client: 'Add a benefit or proof to each title, like "same-day", "licensed" or your city.', expert: 'Rewrite titles with a benefit, proof point or offer.' },
    { impact: 3, confidence: 3, effort: 1 }), 'titleEarnsClick'),
  aiPageRule(ai('2.1.7', 'onpage', 'titles', 'low',
    { client: 'Titles do not match what the page offers', expert: 'Title matches content and search intent' },
    { client: 'When the title promises something the page does not deliver, visitors leave and Google notices.', expert: 'AI judgement of title vs page content and intent.' },
    { client: 'Make each title describe exactly what the page offers.', expert: 'Align titles with on-page content and intent.' },
    { impact: 2, confidence: 3, effort: 1 }), 'titleMatchesContent'),
  aiPageRule(ai('2.2.3', 'onpage', 'meta', 'low',
    { client: 'Search snippets do not say why to choose you', expert: 'Meta description has a benefit and a call to action' },
    { client: 'The snippet under your link is your advert in Google: say what you offer and what to do next.', expert: 'AI judgement of benefit + CTA in the meta description.' },
    { client: 'Write each description as a short advert: what you offer, why you, and "call today".', expert: 'Add benefit and CTA to meta descriptions.' },
    { impact: 2, confidence: 3, effort: 1 }), 'descriptionBenefitCta'),
  aiPageRule(ai('2.3.4', 'onpage', 'headings', 'low',
    { client: 'Headings leave out topics visitors expect', expert: 'Headings cover the expected subtopics' },
    { client: 'Visitors scan headings to find answers (price, process, areas, guarantees). Missing ones send them elsewhere.', expert: 'AI judgement of H2/H3 coverage for the page type.' },
    { client: 'Add sections for the questions customers ask most.', expert: 'Add H2/H3 sections for missing subtopics.' },
    { impact: 2, confidence: 3, effort: 2 }), 'headingsCoverSubtopics'),
  aiPageRule(ai('2.4.2', 'onpage', 'content', 'medium',
    { client: 'Pages do not match what searchers want', expert: 'Content matches the search intent of the page type' },
    { client: 'A service page should help people book; a guide should answer a question. A mismatch ranks poorly.', expert: 'AI judgement of intent vs page type.' },
    { client: 'Make service pages about booking the service, and guides about answering the question.', expert: 'Re-align content with the intent of the template.' },
    { impact: 3, confidence: 3, effort: 3 }), 'intentMatchesPageType'),
  aiPageRule(ai('2.4.4', 'onpage', 'content', 'low',
    { client: 'Pages miss related words people search for', expert: 'Secondary and related terms covered' },
    { client: 'People search in many ways; using the related words helps you show up for more of them.', expert: 'AI judgement of secondary/related term coverage.' },
    { client: 'Mention related services, symptoms and questions in the text.', expert: 'Cover secondary terms and close variants.' },
    { impact: 2, confidence: 2, effort: 2 }), 'relatedTerms'),
  aiPageRule(ai('2.4.5', 'onpage', 'content', 'low',
    { client: 'Pages are vague about brands, equipment and places', expert: 'Entities covered (brands, equipment, certifications, locations)' },
    { client: 'Naming the brands you service, your certifications and the areas you cover builds trust and relevance.', expert: 'AI judgement of entity coverage.' },
    { client: 'Name the brands you work with, your certifications and the towns you serve.', expert: 'Add concrete entities to the copy.' },
    { impact: 2, confidence: 2, effort: 2 }), 'entities'),
  aiPageRule(ai('2.8.1-ai', 'ai', 'aeo', 'medium',
    { client: 'The opening paragraph does not answer the question well', expert: 'Quality of the direct answer near the top' },
    { client: 'AI assistants quote clear, useful opening answers. A vague opening is skipped.', expert: 'AI judgement of the first paragraph as a direct answer.' },
    { client: 'Start each page with two or three sentences that answer what the visitor came for.', expert: 'Rewrite the first paragraph as a concise, specific answer.' },
    { impact: 3, confidence: 3, effort: 2 }), 'answerQuality'),

  aiVisualRule(
    { id: '1.9.5', module: 1, category: 'mobile', card: 'mobile', severity: 'medium',
      title: { client: 'A popup covers the page on phones', expert: 'Intrusive interstitials / popups (mobile)' },
      explain: { client: 'Google ranks pages lower when a popup hides the content on phones.', expert: 'Intrusive interstitials are a mobile ranking demotion signal.' },
      fix: { client: 'Show offers as a small banner instead of a full-screen popup, or delay it.', expert: 'Replace full-screen interstitials with banners; delay or scope them.' },
      ice: { impact: 3, confidence: 3, effort: 2 } },
    'intrusivePopup',
    { client: 'Open the homepage on a phone and check nothing covers the content.', expert: 'Manual: check for intrusive interstitials on mobile (AI screenshot check did not run).' },
  ),
  aiVisualRule(
    { id: '2.7.5', module: 2, category: 'trust', card: 'trust', severity: 'medium',
      title: { client: 'No call or quote button on the first screen', expert: 'Call to action above the fold (mobile)' },
      explain: { client: 'Most visitors decide in seconds. A visible call or quote button turns them into leads.', expert: 'CTA visibility on the first mobile viewport.' },
      fix: { client: 'Put a "Call now" or "Get a quote" button at the top of the homepage on phones.', expert: 'Add a primary CTA in the first mobile viewport.' },
      ice: { impact: 4, confidence: 3, effort: 1 } },
    'ctaAboveFold',
    { client: 'Check a call or quote button shows on the first screen on a phone.', expert: 'Manual: check the first mobile viewport has a CTA (AI screenshot check did not run).' },
  ),
  aiVisualRule(
    { id: '2.5.4', module: 2, category: 'onpage', card: 'images', severity: 'low',
      title: { client: 'Photos look like stock images', expert: 'Real photos instead of stock' },
      explain: { client: 'Real photos of your team, vans and work build far more trust than stock pictures.', expert: 'Original imagery supports E-E-A-T and conversion.' },
      fix: { client: 'Replace stock pictures with real photos of your team and jobs.', expert: 'Swap stock imagery for original photos (with descriptive file names and alt text).' },
      ice: { impact: 2, confidence: 2, effort: 3 } },
    'stockPhotos',
    { client: 'Check the homepage uses real photos of your business.', expert: 'Manual: check for stock imagery (AI screenshot check did not run).' },
  ),

  {
    id: '1.9.3', module: 1, category: 'mobile', card: 'mobile', scope: 'page', severity: 'medium',
    title: { client: 'Phones see less of the page than computers', expert: 'Mobile vs desktop content parity' },
    explain: { client: 'Google reads the phone version of your site. Text or links missing there are missing for Google too.', expert: 'Mobile-first indexing: > 20% fewer words or internal links on the mobile response.' },
    fix: { client: 'Show the same text and links on phones as on computers (collapsed is fine, removed is not).', expert: 'Serve equivalent content and links to mobile user agents.' },
    ice: { impact: 3, confidence: 3, effort: 3 },
    evaluate: ({ data }) =>
      countPages(data.parity ?? [], parityGap, (n) =>
        n ? { client: `${plural(n, 'page')} ${n === 1 ? 'shows' : 'show'} less on phones`, expert: `${n} pages with > 20% fewer words or internal links on mobile` } : { client: 'Phones see the same content', expert: 'Mobile and desktop content match' }, 'warn'),
  },

  {
    id: '1.3.6', module: 1, category: 'technical', card: 'indexing', scope: 'site', severity: 'info', method: 'manual',
    title: { client: 'Google penalties and security warnings', expert: 'Manual actions / security issues (Search Console)' },
    explain: { client: 'Google can penalise or flag a hacked site; only Search Console shows this.', expert: 'Not available through the API: check Security & Manual Actions in Search Console.' },
    fix: { client: 'Ask us to check Search Console for warnings.', expert: 'Search Console → Security & Manual Actions → Manual actions / Security issues.' },
    ice: { impact: 5, confidence: 5, effort: 1 },
    evaluate: () => ({ status: 'manual', message: { client: 'Check Search Console for penalties and security warnings', expert: 'Manual: open Search Console → Security & Manual Actions (not exposed by the API)' } }),
  },
];
