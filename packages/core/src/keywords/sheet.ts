import { blogIdeas } from '../mapping/blog-ideas';
import { pathOf, type MappingWorkspace } from '../mapping/mapping';
import type { Sheet, SheetCell } from '../report/xlsx';
import type { KeywordInsights } from './insights';
import { localOf } from './local-volume';
import { normTerm } from './clean';
import type { KeywordRecord, KeywordWorkspace } from './types';

/**
 * The final keyword research sheet (step 17): one workbook with every kept keyword and its role and page,
 * the topics with their scores, the page plan, blog ideas, competing pages and what was removed and why.
 */
const INTENT: Record<string, string> = { transactional: 'Ready to buy or hire', commercial: 'Comparing options', informational: 'Learning', navigational: 'Looking for a site' };
const ACTION: Record<string, string> = { optimise: 'Improve the page', expand: 'Add more content', merge: 'Merge into the main page', create: 'Create a new page', leave: 'Keep as it is (top 3)' };
const SOURCE: Record<string, string> = { seed: 'Your services', ranked: 'You rank for it', competitor: 'Competitor', suggestion: 'Keyword ideas', autocomplete: 'Google autocomplete', gsc: 'Search Console', import: 'Imported', manual: 'Added by hand' };
const yes = (b: boolean) => (b ? 'yes' : '');
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** insights: the verdict and top moves (FEATURE_KEYWORD_INSIGHTS); they open the Summary sheet, and local volume gets its own column. */
export function keywordResearchSheets(kw: KeywordWorkspace, mapping: MappingWorkspace | null | undefined, insights: KeywordInsights | null = null): Sheet[] {
  const localPlace = insights ? kw.localPlaces?.find((p) => p.locationName)?.place ?? null : null;
  const clusters = new Map(kw.clusters.map((c) => [c.id, c]));
  const rows = new Map((mapping?.rows ?? []).map((r) => [r.clusterId, r]));
  // A keyword's topic for the page plan: moved by hand there, else its research topic.
  const topicOf = (k: KeywordRecord) => mapping?.moves?.[normTerm(k.term)] ?? k.clusterId;
  const page = (clusterId: string | null) => {
    const r = clusterId ? rows.get(clusterId) : undefined;
    if (!r) return '';
    return r.url ?? `NEW PAGE: ${r.suggestedPath ?? ''}`;
  };
  const role = (k: KeywordRecord, clusterId: string | null) => {
    const r = clusterId ? rows.get(clusterId) : undefined;
    const c = clusterId ? clusters.get(clusterId) : undefined;
    if (r) return normTerm(r.primaryKeyword) === normTerm(k.term) ? 'Primary' : r.secondaryKeywords.some((s) => normTerm(s) === normTerm(k.term)) ? 'Secondary' : 'Supporting';
    if (c) return normTerm(c.head) === normTerm(k.term) ? 'Primary' : 'Supporting';
    return '';
  };

  const kept = kw.keywords
    .filter((k) => k.status === 'kept')
    .sort((a, b) => (clusters.get(topicOf(b) ?? '')?.priority ?? 0) - (clusters.get(topicOf(a) ?? '')?.priority ?? 0) || (b.volume ?? -1) - (a.volume ?? -1));

  const keywords: Sheet = {
    name: 'Keywords',
    header: ['Keyword', 'Topic', 'Role', 'Page', 'Intent', 'Searches a month', 'Difficulty (0-100)', 'CPC (USD)', 'Your position', 'Topic traffic potential', 'Topic priority (1-25)', 'Quick win', 'Found from', 'Competitor gap', 'Google page-1 features', ...(localPlace ? [`Searches a month in ${localPlace}`] : [])],
    rows: kept.map((k) => {
      const cid = topicOf(k);
      const c = cid ? clusters.get(cid) : undefined;
      return [
        k.term, c?.name ?? '', role(k, cid), page(cid), k.intent ? INTENT[k.intent] : '', k.volume, k.difficulty, k.cpc === null ? null : Math.round(k.cpc * 100) / 100, k.position,
        c?.trafficPotential ?? null, c?.priority ?? null, yes(Boolean(k.position && k.position >= 4 && k.position <= 20)), k.sources.map((s) => SOURCE[s] ?? s).join(', '), yes(Boolean(k.gapFrom?.length)), (k.serpFeatures ?? []).join(', '),
        ...(localPlace ? [localOf(k, localPlace)?.volume ?? null] : []),
      ];
    }),
  };

  const topics: Sheet = {
    name: 'Topics',
    header: ['Priority (1-25)', 'Topic', 'Main keyword', 'Keywords', 'Searches a month', 'Traffic potential (visits/month for #1)', 'Value to you (1-5)', 'Chance to rank (1-5)', 'Intent', 'Page Google ranks', 'Your best position', 'Quick win', 'Long-term', 'Publish by', 'Page', 'Action'],
    rows: kw.clusters.map((c) => {
      const r = rows.get(c.id);
      return [c.priority, c.name, c.head, c.size, c.volume, c.trafficPotential ?? null, c.businessValue, c.rankingChance, c.intent ? INTENT[c.intent] : '', c.pageType.replace('_', ' '), c.bestPosition, yes(c.quickWin), yes(c.longTerm), c.seasonalDeadline, page(c.id), r ? ACTION[r.action] : ''];
    }),
  };

  const plan: Sheet = {
    name: 'Page plan',
    header: ['Priority', 'Topic', 'Page', 'Action', 'Primary keyword', 'Secondary keywords', 'Position now', 'Target', 'New title', 'New H1', 'New meta description', 'Links to add from', 'Schema to add', 'Status'],
    rows: (mapping?.rows ?? []).map((r) => [
      r.priority, r.topic, r.url ?? `NEW PAGE: ${r.suggestedPath ?? ''}`, ACTION[r.action], r.primaryKeyword, r.secondaryKeywords.join('; '), r.currentPosition, r.targetPosition, r.drafts?.title, r.drafts?.h1, r.drafts?.meta,
      r.linksToAdd.map((l) => pathOf(l.from)).join('; '), r.schemaNeeded.join(', '), r.status.replace('_', ' '),
    ]),
  };

  const blog: Sheet = {
    name: 'Blog ideas',
    header: ['Priority', 'Article title', 'Main keyword', 'Supporting keywords', 'Searches a month', 'Traffic potential', 'Suggested address', 'FAQ questions', 'Link to', 'Publish by'],
    rows: blogIdeas(kw, mapping).map((b) => [b.priority, b.title, b.mainKeyword, b.supporting.join('; '), b.volume, b.trafficPotential, b.path, b.faq.join(' | '), b.linkTo ? pathOf(b.linkTo) : '', b.liveBy]),
  };

  const competing: Sheet = {
    name: 'Competing pages',
    header: ['Topic', 'Main page', 'Competing page', 'Share of clicks', 'Settled by', 'What happens to the competing page'],
    rows: (mapping?.rows ?? []).flatMap((r) =>
      r.conflicts.map((c) => [r.topic, r.url, c.url, pct(c.share), !r.conflictSettled ? 'Not settled' : r.conflictAuto ? 'Automatically (most clicks)' : 'A person', r.conflictPlan === 'merge' ? 'Merge and redirect' : 'Give it another keyword']),
    ),
  };

  const removed: Sheet = {
    name: 'Removed keywords',
    header: ['Keyword', 'Why removed', 'Searches a month', 'Difficulty (0-100)'],
    rows: kw.keywords.filter((k) => k.status === 'removed').sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).map((k) => [k.term, k.removeReason ?? '', k.volume, k.difficulty]),
  };

  const totalTp = kw.clusters.reduce((s, c) => s + (c.trafficPotential ?? 0), 0);
  const summary: Sheet = {
    name: 'Summary',
    header: ['Keyword research', ''],
    widths: [34, 60],
    rows: [
      ['Website', kw.domain],
      ['Country / language', `${kw.country} / ${kw.language}`],
      ['Researched', kw.lastRunAt?.slice(0, 10) ?? ''],
      ['Services / products', kw.seeds.services.join(', ')],
      ['Places', kw.seeds.locations.join(', ')],
      ['Keywords kept', kept.length],
      ['Keywords removed', removed.rows.length],
      ['Topics', kw.clusters.length],
      ['Quick wins (positions 4-20)', kw.clusters.filter((c) => c.quickWin).length],
      ['Traffic potential, all topics (visits/month)', totalTp],
      ['Pages mapped', (mapping?.rows ?? []).filter((r) => r.url).length],
      ['New pages needed', (mapping?.rows ?? []).filter((r) => !r.url).length],
      ['Blog ideas', blog.rows.length],
      ['Competing pages', competing.rows.length],
      ...(insights
        ? [
            ['', ''],
            ['Verdict', insights.verdict],
            ...insights.moves.flatMap((m, i): SheetCell[][] => [
              [`Move ${i + 1}`, `${m.topic}: ${m.url ? `improve ${m.url}` : `new page at ${m.newPath}`}`],
              ['  Demand', `${m.demand.toLocaleString('en-US')} searches a month${m.localDemand !== null && m.localPlace ? ` (${m.localDemand.toLocaleString('en-US')} in ${m.localPlace})` : ''}; difficulty ${m.difficulty ?? 'unknown'}; position ${m.position === null ? 'not ranking' : `#${Math.round(m.position)}`}`],
              ['  Title', m.title],
              ['  Sections', m.sections.join('; ')],
              ['  Why', m.why],
            ]),
          ]
        : []),
    ],
  };
  return [summary, topics, keywords, plan, blog, competing, removed];
}
