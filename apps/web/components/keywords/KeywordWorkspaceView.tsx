import type { ReactNode } from 'react';
import { keywordStats, queryKeywords, type KeywordWorkspace } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { ClusterBoard } from './ClusterBoard';
import { AddKeywordsForm, KeywordRunButtons, SeedsForm } from './forms';
import { KeywordTable } from './KeywordTable';
import { QuestionsCard } from './QuestionsCard';
import { TopTopics } from './TopTopics';

/**
 * Module 4 workspace (spec §16.2), the same for the team (any client) and for customers
 * (their own sites). Customers see their top topics first, with the details folded away.
 */
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'never');

export function KeywordWorkspaceView({ ws, audience }: { ws: KeywordWorkspace; audience: 'team' | 'customer' }) {
  const stats = keywordStats(ws);
  const customer = audience === 'customer';
  const ready = ws.keywords.length > 0;
  // Customers: once there are results, settings and the full lists open on demand. Always the same
  // elements (only `open` changes), so forms keep their messages when results arrive.
  const fold = (summary: string, children: ReactNode) =>
    customer ? (
      <details open={!ready} className="group rounded-panel border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-5 font-display text-[17px] font-bold">{summary}</summary>
        <div className="border-t border-border p-5">{children}</div>
      </details>
    ) : (
      children
    );
  const byService = new Map<string, typeof ws.prompts>();
  for (const p of ws.prompts) byService.set(p.service ?? 'General', [...(byService.get(p.service ?? 'General') ?? []), p]);

  return (
    <div className="flex flex-col gap-6">
      {customer && <TopTopics clusters={ws.clusters} />}
      {customer && (
        <Card title={ready ? 'Keep your keywords up to date' : 'Find your keywords'} eyebrow={`Last research: ${day(ws.lastRunAt)}`}>
          <KeywordRunButtons domain={ws.domain} hasKeywords={stats.kept > 0} hasClusters={stats.clusters > 0} audience={audience} />
          <p className="mt-2 text-[13px] text-ink-3">We collect the searches your customers use (from Google, your rankings and your competitors), remove the ones that will not bring you work, and group the rest into topics. One page should target each topic.</p>
        </Card>
      )}
      {fold(ws.businessType === 'shop' ? 'Your products and searches' : 'Your services, places and searches', (
      <Card title={ws.businessType === 'shop' ? 'What you sell' : 'What you offer and where'} eyebrow={customer ? undefined : `Last research: ${day(ws.lastRunAt)}`}>
        <div className="flex flex-col gap-6">
          <SeedsForm domain={ws.domain} businessType={ws.businessType ?? 'services'} country={ws.country} language={ws.language} seeds={ws.seeds} />
          {!customer && (
          <div className="border-t border-border pt-5">
            <KeywordRunButtons domain={ws.domain} hasKeywords={stats.kept > 0} hasClusters={stats.clusters > 0} audience={audience} />
            <p className="mt-2 text-[13px] text-ink-3">
              {'Research: the site’s rankings, the keyword gap with up to 3 competitors (what they rank for and this site does not), local keyword ideas, Google suggestions and Search Console (when connected), then metrics for new keywords, then topics (one Google check for each of the top 60, ≈ $0.002, cached; it also collects "People also ask" questions and page-1 features). First run about $0.15–0.30; sources fetched in the last 7 days are reused, so re-runs cost little. Prompts: OpenAI, from the services and places only.'}
            </p>
          </div>
          )}
        </div>
      </Card>
      ))}

      {ready && !customer && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile value={stats.kept.toLocaleString('en-US')} label="Keywords kept" hint={`${stats.removed.toLocaleString('en-US')} removed`} variant="raised" />
          <StatTile value={stats.volume.toLocaleString('en-US')} label="Searches / month" hint="All kept keywords" variant="raised" />
          <StatTile value={String(stats.clusters)} label="Clusters" hint={ws.clusteredAt ? `Built ${day(ws.clusteredAt)}` : 'Not built yet'} variant="raised" />
          <StatTile value={String(stats.quickWins)} label="Quick wins" hint="Already on page 1–2" variant="raised" />
        </div>
      )}

      {ws.clusters.length > 0 && fold(ws.clusters.length === 1 ? 'Your topic' : `All ${ws.clusters.length} topics`, (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Clusters by priority</h2>
            <p className="text-[13px] text-ink-3">Priority = business value × chance to rank (1–5 each). Change either and it is kept.</p>
          </div>
          <ClusterBoard domain={ws.domain} clusters={ws.clusters} keywords={ws.keywords} />
        </section>
      ))}

      {(ws.questions?.length ?? 0) > 0 && fold('Questions people ask Google', <QuestionsCard ws={ws} />)}

      {fold(stats.kept === 1 ? 'All 1 keyword' : `All ${stats.kept.toLocaleString('en-US')} keywords`, (
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Keywords</h2>
          {ws.keywords.length > 0 && (
            <a href={`/api/keywords/${ws.domain}/csv`} className="inline-flex min-h-10 items-center rounded-button border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3">
              Download CSV
            </a>
          )}
        </div>
        {ws.keywords.length === 0 ? (
          <p className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-2">No keywords yet. Add your services and places, save, then press “Research keywords”.</p>
        ) : (
          <KeywordTable key={`${ws.lastRunAt}|${ws.clusteredAt}|${ws.keywords.length}`} domain={ws.domain} initial={queryKeywords(ws, {})} />
        )}
      </section>
      ))}

      {fold('Questions people ask AI assistants', (
      <Card title="Questions people ask AI assistants" eyebrow={ws.promptsAt ? `Written ${day(ws.promptsAt)}` : undefined}>
        {ws.prompts.length === 0 ? (
          <p className="text-sm text-ink-2">Press “Write AI prompts” for 30–50 questions customers ask ChatGPT, Gemini or Perplexity where you want to be the answer. They are saved for AI search tracking.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {[...byService].map(([service, list]) => (
              <div key={service}>
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">{service}</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {list.map((p) => (
                    <li key={p.id} className="text-[15px] text-ink">{p.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
      ))}

      <Card title="Add keywords you know">
        <AddKeywordsForm domain={ws.domain} />
      </Card>
    </div>
  );
}
