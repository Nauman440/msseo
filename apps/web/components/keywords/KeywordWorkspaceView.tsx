import { keywordStats, type KeywordWorkspace } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { ClusterBoard } from './ClusterBoard';
import { AddKeywordsForm, KeywordRunButtons, SeedsForm } from './forms';
import { KeywordTable, type KeywordRow } from './KeywordTable';

/**
 * Module 4 workspace (spec §16.2), the same for the team (any client) and for customers
 * (their own sites). `audience` only changes the wording.
 */
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'never');

export function KeywordWorkspaceView({ ws, audience }: { ws: KeywordWorkspace; audience: 'team' | 'customer' }) {
  const stats = keywordStats(ws);
  const names = new Map(ws.clusters.map((c) => [c.id, c.name]));
  const rows: KeywordRow[] = ws.keywords.map((k) => ({
    term: k.term, volume: k.volume, difficulty: k.difficulty, cpc: k.cpc, intent: k.intent, position: k.position, status: k.status, reason: k.removeReason,
    cluster: k.clusterId ? names.get(k.clusterId) ?? null : null,
  }));
  const byService = new Map<string, typeof ws.prompts>();
  for (const p of ws.prompts) byService.set(p.service ?? 'General', [...(byService.get(p.service ?? 'General') ?? []), p]);

  return (
    <div className="flex flex-col gap-6">
      <Card title="What you offer and where" eyebrow={`Last research: ${day(ws.lastRunAt)}`}>
        <div className="flex flex-col gap-6">
          <SeedsForm domain={ws.domain} country={ws.country} language={ws.language} seeds={ws.seeds} />
          <div className="border-t border-border pt-5">
            <KeywordRunButtons domain={ws.domain} hasKeywords={stats.kept > 0} hasClusters={stats.clusters > 0} />
            <p className="mt-2 text-[13px] text-ink-3">
              {audience === 'team'
                ? 'Research: the site’s rankings, up to 3 competitors’ rankings, keyword ideas, Google suggestions and Search Console (when connected), then metrics for every keyword: about $0.10–0.20. Clusters: one Google check per keyword for the top 60 (≈ $0.002 each, cached). Prompts: OpenAI, from the services and places only.'
                : 'We collect the searches your customers use (from Google, your rankings and your competitors), remove the ones that will not bring you work, and group the rest into topics. One page should target each topic.'}
            </p>
          </div>
        </div>
      </Card>

      {ws.keywords.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile value={stats.kept.toLocaleString('en-US')} label="Keywords kept" hint={`${stats.removed.toLocaleString('en-US')} removed`} variant="raised" />
          <StatTile value={stats.volume.toLocaleString('en-US')} label="Searches / month" hint="All kept keywords" variant="raised" />
          <StatTile value={String(stats.clusters)} label="Clusters" hint={ws.clusteredAt ? `Built ${day(ws.clusteredAt)}` : 'Not built yet'} variant="raised" />
          <StatTile value={String(stats.quickWins)} label="Quick wins" hint="Already on page 1–2" variant="raised" />
        </div>
      )}

      {ws.clusters.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Clusters by priority</h2>
            <p className="text-[13px] text-ink-3">Priority = business value × chance to rank (1–5 each). Change either and it is kept.</p>
          </div>
          <ClusterBoard domain={ws.domain} clusters={ws.clusters} keywords={ws.keywords} />
        </section>
      )}

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
          <KeywordTable domain={ws.domain} rows={rows} />
        )}
      </section>

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

      <Card title="Add keywords you know">
        <AddKeywordsForm domain={ws.domain} />
      </Card>
    </div>
  );
}
