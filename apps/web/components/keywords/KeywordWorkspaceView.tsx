import { keywordStats, LOW_VOLUME, queryKeywords, type KeywordFrom, type KeywordWorkspace } from '@seo/core';
import { MappingSection, type MappingParams } from '@/components/mapping/MappingSection';
import { Term } from '@/components/ui/Term';
import { cn } from '@/lib/tones';
import { AutopilotPanel } from './AutopilotPanel';
import { ClusterBoard } from './ClusterBoard';
import { AddKeywordsForm, SeedsForm } from './forms';
import { KeywordTable } from './KeywordTable';
import { QuestionsView } from './QuestionsView';
import { KeywordTabs, viewHref, type KeywordOpen, type KeywordView } from './KeywordTabs';
import type { TopicOrder } from './labels';
import { TopTopics } from './TopTopics';

/**
 * Keywords (Module 4) and the page plan (Module 5), written for someone who knows nothing about SEO.
 * Keywords reads top to bottom: what autopilot did, what it is based on (editable), four numbers,
 * where to start, every topic, and every keyword folded away. The same for the team and customers;
 * the team also gets the scoring controls and the research tools.
 */
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const FOLD = 'group rounded-card border border-border bg-surface';
const FOLD_SUMMARY = 'flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-[22px] py-4 [&::-webkit-details-marker]:hidden';

export type KeywordPageState = { view: KeywordView; open: KeywordOpen; order: TopicOrder; allTopics: boolean; from?: KeywordFrom; mapping?: MappingParams };

const list = (items: string[], max = 3) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '));

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0 text-ink-2 transition-transform group-open:rotate-180">
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KeywordWorkspaceView({ ws, audience, base, state, mappedTopics }: {
  ws: KeywordWorkspace;
  audience: 'team' | 'customer';
  base: string;
  state: KeywordPageState;
  /** Topics in the page plan (Module 5), for the tab count. */
  mappedTopics: number;
}) {
  const stats = keywordStats(ws);
  const kept = ws.keywords.filter((k) => k.status === 'kept');
  const shop = ws.businessType === 'shop';
  const tiles = [
    { label: 'Searches we target', term: 'keyword' as const, value: stats.kept, hint: 'Picked because they can bring you customers' },
    { label: 'On Google’s first page', term: 'position' as const, value: kept.filter((k) => k.position !== null && k.position <= 10).length, hint: 'You already show in the top 10' },
    { label: 'Quick wins', term: 'quickWin' as const, value: kept.filter((k) => k.position !== null && k.position >= 4 && k.position <= 20).length, hint: 'Small fixes can move you up', highlight: true },
    { label: 'Not on Google yet', term: 'notShowing' as const, value: kept.filter((k) => k.position === null).length, hint: 'Need a page or more content' },
  ];
  const based = [list(ws.seeds.services), !shop && ws.seeds.locations.length ? `in ${list(ws.seeds.locations, 2)}` : ''].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-[22px]">
      <KeywordTabs base={base} view={state.view} keywords={stats.kept} topics={mappedTopics} />

      {state.view === 'mapping' && <MappingSection domain={ws.domain} base={base} audience={audience} keywords={ws.keywords} params={state.mapping ?? {}} />}

      {state.view === 'keywords' && (
        <>
          <AutopilotPanel ws={ws} kept={stats.kept} topics={stats.clusters} audience={audience} />

          <details id="research-inputs" open={state.open === 'inputs' || !ws.seeds.services.length} className={FOLD}>
            <summary className={FOLD_SUMMARY}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={EYEBROW}>What we look for</span>
                <span className="break-words text-[15px] font-semibold">{based || `Nothing yet: add what you ${shop ? 'sell' : 'offer'}`}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-heading">Change <Chevron /></span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-border px-[22px] py-5">
              <p className="max-w-2xl text-sm text-ink-2">
                Autopilot starts from these. If something is wrong or missing, fix it and save; the next update uses your changes{audience === 'customer' ? '' : ' (or press “Check for new keywords now”)'}.
              </p>
              <SeedsForm domain={ws.domain} businessType={ws.businessType ?? 'services'} country={ws.country} language={ws.language} seeds={ws.seeds} />
              {audience === 'team' && (
                <p className="border-t border-border pt-4 text-[13px] text-ink-3">
                  {'Research: the site’s rankings, the keyword gap with up to 3 competitors, local keyword ideas, Google suggestions and Search Console (when connected), then metrics for new keywords, cleaning and the focus list (best 20 per service), then topics (one Google check for each of the top 60, ≈ $0.002, cached). First run about $0.15–0.30; sources fetched in the last 7 days are reused.'}
                </p>
              )}
            </div>
          </details>

          {stats.kept > 0 && (
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className={cn('rounded-[14px] border px-[18px] py-4', t.highlight ? 'border-primary-tint bg-primary-wash' : 'border-border bg-surface')}>
                  <dt className={EYEBROW}><Term k={t.term}>{t.label}</Term></dt>
                  <dd className="mt-1 font-display text-[30px] font-extrabold tabular">{t.value.toLocaleString('en-US')}</dd>
                  <dd className="mt-0.5 text-[12.5px] text-ink-2">{t.hint}</dd>
                </div>
              ))}
            </dl>
          )}

          <TopTopics clusters={ws.clusters} />

          {ws.clusters.length > 0 && (
            <ClusterBoard
              domain={ws.domain}
              clusters={ws.clusters}
              keywords={ws.keywords}
              order={state.order}
              showAll={state.allTopics}
              allHref={viewHref(base, 'keywords', { topics: 'all', ...(state.order !== 'priority' ? { sort: state.order } : {}) })}
              business={ws.businessType}
              editable={audience === 'team'}
            />
          )}

          <details id="all-keywords" open={state.open === 'all' || Boolean(state.from)} className={FOLD}>
            <summary className={FOLD_SUMMARY}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[17px] font-bold">{stats.kept + stats.removed > 0 ? `See every keyword (${stats.kept.toLocaleString('en-US')})` : 'Add keywords yourself'}</span>
                <span className="text-[13.5px] text-ink-2">The full list, with the ones we left out and why. Remove any that do not fit, or add words your customers use.</span>
              </span>
              <Chevron />
            </summary>
            <div className="flex flex-col gap-[22px] border-t border-border p-[22px]">
              <KeywordTable
                key={`${ws.lastRunAt}|${ws.clusteredAt}|${ws.keywords.length}`}
                domain={ws.domain}
                business={ws.businessType ?? 'services'}
                topics={ws.clusters.map((c) => ({ id: c.id, name: c.name }))}
                initial={queryKeywords(ws, { from: state.from, minVolume: LOW_VOLUME })}
                initialFrom={state.from ?? ''}
              />
              <section aria-labelledby="add-keywords" className="flex flex-col gap-3.5 border-t border-border pt-5">
                <div>
                  <h3 id="add-keywords" className="font-display text-lg font-bold">Add words your customers use</h3>
                  <p className="mt-1 text-sm text-ink-2">Things people say on the phone or in emails. We look up how often they are searched and put each one in a topic. Words you add are always kept.</p>
                </div>
                <AddKeywordsForm domain={ws.domain} />
              </section>
            </div>
          </details>

          <details id="questions" open={state.open === 'questions'} className={cn(FOLD, 'scroll-mt-24')}>
            <summary className={FOLD_SUMMARY}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[17px] font-bold">Questions people ask AI ({ws.prompts.length.toLocaleString('en-US')})</span>
                <span className="text-[13.5px] text-ink-2">What your customers might ask ChatGPT and other AI assistants. We check whether they recommend you.</span>
              </span>
              <Chevron />
            </summary>
            <div className="border-t border-border p-[22px]">
              <QuestionsView ws={ws} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
