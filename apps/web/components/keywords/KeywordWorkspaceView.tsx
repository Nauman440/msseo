import { keywordStats, LOW_VOLUME, queryKeywords, type KeywordFrom, type KeywordWorkspace } from '@seo/core';
import { MappingSection, type MappingParams } from '@/components/mapping/MappingSection';
import { cn } from '@/lib/tones';
import { ClusterBoard } from './ClusterBoard';
import { AddKeywordsForm, KeywordRunButtons, SeedsForm } from './forms';
import { KeywordTable } from './KeywordTable';
import { KeywordTabs, viewHref, type KeywordView } from './KeywordTabs';
import type { TopicOrder } from './labels';
import { QuestionsView } from './QuestionsView';
import { TopTopics } from './TopTopics';
import { Term } from '@/components/ui/Term';

/**
 * Module 4 workspace in the keyword design (design-reference/Keywords tab *.zip): sub-tabs
 * Overview · All keywords · Page mapping (Module 5) · Questions for AI · Research inputs. The same for the team (any
 * client) and for customers (their own sites).
 */
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';

export type KeywordPageState = { view: KeywordView; order: TopicOrder; allTopics: boolean; from?: KeywordFrom; mapping?: MappingParams };

/** "142 keywords in 18 topics for 6 services in Dallas" */
function summary(ws: KeywordWorkspace, kept: number) {
  const shop = ws.businessType === 'shop';
  const n = ws.seeds.services.length;
  const what = `${n} ${shop ? (n === 1 ? 'product' : 'products') : n === 1 ? 'service' : 'services'}`;
  const places = ws.seeds.locations;
  const where = !shop && places.length ? ` in ${places[0]}${places.length > 1 ? ` and ${places.length - 1} more ${places.length === 2 ? 'place' : 'places'}` : ''}` : '';
  return `${kept.toLocaleString('en-US')} keywords in ${ws.clusters.length} ${ws.clusters.length === 1 ? 'topic' : 'topics'} for ${what}${where}`;
}

export function KeywordWorkspaceView({ ws, audience, base, state, mappedTopics }: {
  ws: KeywordWorkspace;
  audience: 'team' | 'customer';
  base: string;
  state: KeywordPageState;
  /** Topics in the page mapping (Module 5), for the tab count. */
  mappedTopics: number;
}) {
  const stats = keywordStats(ws);
  const kept = ws.keywords.filter((k) => k.status === 'kept');
  const ready = kept.length > 0;
  const view = state.view;
  const tiles = [
    { label: 'Keywords', term: 'keyword' as const, value: stats.kept, hint: 'Kept after cleaning' },
    { label: 'Topics', term: 'topic' as const, value: stats.clusters, hint: 'One page each' },
    { label: 'On page 1', term: 'position' as const, value: kept.filter((k) => k.position !== null && k.position <= 10).length, hint: 'Positions 1 to 10' },
    { label: 'Quick wins', term: 'quickWin' as const, value: kept.filter((k) => k.position !== null && k.position >= 4 && k.position <= 20).length, hint: 'Positions 4 to 20', highlight: true },
    { label: 'Not showing yet', term: 'notShowing' as const, value: kept.filter((k) => k.position === null).length, hint: 'Need a page or more content' },
  ];

  return (
    <div className="flex flex-col gap-[22px]">
      <KeywordTabs base={base} view={view} keywords={stats.kept} topics={mappedTopics} questions={ws.prompts.length} />

      {(view === 'overview' || view === 'all') && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
          <div className="flex flex-col gap-1">
            <p className={EYEBROW}>{ws.lastRunAt ? `Last research · ${day(ws.lastRunAt)}` : 'No research yet'}</p>
            <p className="text-[15px] font-semibold">
              {ready ? summary(ws, stats.kept) : ws.seeds.services.length ? 'Ready to research: press “Research keywords”.' : 'Add your services first under Research inputs.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ready && (
              <a href={`/api/keywords/${ws.domain}/sheet`} download className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3">
                Download research sheet (.xlsx)
              </a>
            )}
            <KeywordRunButtons domain={ws.domain} hasKeywords={stats.kept > 0} hasClusters={stats.clusters > 0} audience={audience} />
          </div>
        </div>
      )}

      {view === 'overview' && (
        <>
          {ready && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {tiles.map((t) => (
                <div key={t.label} className={cn('rounded-[14px] border px-[18px] py-4', t.highlight ? 'border-primary-tint bg-primary-wash' : 'border-border bg-surface')}>
                  <dt className={EYEBROW}><Term k={t.term}>{t.label}</Term></dt>
                  <dd className="mt-1 font-display text-[30px] font-extrabold tabular">{t.value.toLocaleString('en-US')}</dd>
                  <dd className="mt-0.5 text-[12px] text-ink-2">{t.hint}</dd>
                </div>
              ))}
            </dl>
          )}
          {!ready && (
            <p className="rounded-card border border-border bg-surface p-6 text-[15px] text-ink-2">
              No keywords yet. Add your {ws.businessType === 'shop' ? 'products' : 'services and places'} under <a href={viewHref(base, 'inputs')} className="font-semibold text-primary-text underline">Research inputs</a>, then press “Research keywords”.
            </p>
          )}
          <TopTopics clusters={ws.clusters} />
          {ws.clusters.length > 0 && (
            <ClusterBoard
              domain={ws.domain}
              clusters={ws.clusters}
              keywords={ws.keywords}
              order={state.order}
              showAll={state.allTopics}
              allHref={viewHref(base, 'overview', { topics: 'all', ...(state.order !== 'priority' ? { sort: state.order } : {}) })}
              business={ws.businessType}
            />
          )}
        </>
      )}

      {view === 'all' && (
        <>
          <KeywordTable
            key={`${ws.lastRunAt}|${ws.clusteredAt}|${ws.keywords.length}`}
            domain={ws.domain}
            business={ws.businessType ?? 'services'}
            topics={ws.clusters.map((c) => ({ id: c.id, name: c.name }))}
            initial={queryKeywords(ws, { from: state.from, minVolume: LOW_VOLUME })}
            initialFrom={state.from ?? ''}
          />
          <section aria-labelledby="add-keywords" className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-[22px]">
            <div>
              <h2 id="add-keywords" className="font-display text-xl font-bold">Add keywords you know</h2>
              <p className="mt-1 text-sm text-ink-2">Words your customers use on the phone or in emails. We add search data and put each one in a topic.</p>
            </div>
            <AddKeywordsForm domain={ws.domain} />
          </section>
        </>
      )}

      {view === 'mapping' && <MappingSection domain={ws.domain} base={base} audience={audience} keywords={ws.keywords} params={state.mapping ?? {}} />}

      {view === 'questions' && <QuestionsView ws={ws} />}

      {view === 'inputs' && (
        <section aria-labelledby="inputs" className="flex flex-col gap-5 rounded-card border border-border bg-surface p-[22px]">
          <div>
            <p className={EYEBROW}>{ws.lastRunAt ? `Last research · ${day(ws.lastRunAt)}` : 'No research yet'}</p>
            <h2 id="inputs" className="mt-1 font-display text-xl font-bold">{ws.businessType === 'shop' ? 'What you sell' : 'What you offer and where'}</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">The research starts from these. Save, then press “Update keywords” on the Overview.</p>
          </div>
          <SeedsForm domain={ws.domain} businessType={ws.businessType ?? 'services'} country={ws.country} language={ws.language} seeds={ws.seeds} />
          {audience === 'team' && (
            <p className="border-t border-border pt-4 text-[13px] text-ink-3">
              {'Research: the site’s rankings, the keyword gap with up to 3 competitors (what they rank for and this site does not), local keyword ideas, Google suggestions and Search Console (when connected), then metrics for new keywords, then topics (one Google check for each of the top 60, ≈ $0.002, cached; it also collects "People also ask" questions and page-1 features). First run about $0.15–0.30; sources fetched in the last 7 days are reused, so re-runs cost little. Questions for AI: OpenAI, from the services and places only.'}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
