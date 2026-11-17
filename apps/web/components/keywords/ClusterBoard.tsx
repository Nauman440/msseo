import type { KeywordCluster, KeywordRecord } from '@seo/core';
import { cn } from '@/lib/tones';
import { ClusterScores } from './forms';

/** 4.5–4.6 Cluster board: one card per topic, highest priority first. */
const PAGE_TYPE: Record<KeywordCluster['pageType'], string> = {
  home: 'Homepage',
  service: 'Service page',
  location: 'Location page',
  service_location: 'Service + city page',
  blog_post: 'Article or guide',
  directory: 'Directory listings',
};
const INTENT: Record<string, string> = { transactional: 'Ready to buy', commercial: 'Comparing', informational: 'Learning', navigational: 'Looking for a site' };
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function ClusterBoard({ domain, clusters, keywords, limit = 24 }: { domain: string; clusters: KeywordCluster[]; keywords: KeywordRecord[]; limit?: number }) {
  const members = new Map<string, string[]>();
  for (const k of keywords) if (k.clusterId && k.status === 'kept') members.set(k.clusterId, [...(members.get(k.clusterId) ?? []), k.term]);
  const shown = clusters.slice(0, limit);
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const terms = members.get(c.id) ?? [];
          return (
            <li key={c.id} className="flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 break-words font-display text-[17px] font-bold leading-snug">{c.name}</h3>
                <span className="shrink-0 rounded-pill bg-night px-2 py-0.5 text-[12px] font-bold text-mist tabular" title="Value × chance to rank">
                  {c.priority}/25
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
                {c.quickWin && <span className="rounded-pill bg-pass-bg px-2 py-0.5 text-pass-text">Quick win · #{c.bestPosition}</span>}
                {c.longTerm && <span className="rounded-pill bg-teal-chip px-2 py-0.5 text-teal-text">Long-term</span>}
                {c.seasonalPeak && (
                  <span className="rounded-pill bg-amber-bg px-2 py-0.5 text-amber-text">
                    Peaks in {MONTH[c.seasonalPeak - 1]}
                    {c.seasonalDeadline ? ` · live by ${day(c.seasonalDeadline)}` : ''}
                  </span>
                )}
                <span className="rounded-pill bg-info-bg px-2 py-0.5 text-info-text">{PAGE_TYPE[c.pageType]}</span>
                {c.intent && <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-primary-text">{INTENT[c.intent]}</span>}
              </div>
              <p className="text-[13px] text-ink-2 tabular">
                {c.volume.toLocaleString('en-US')} searches / month · {c.size} keyword{c.size === 1 ? '' : 's'}
                {c.bestPosition !== null && !c.quickWin ? ` · you rank #${c.bestPosition}` : ''}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {terms.slice(0, 8).map((t) => (
                  <li key={t} className="rounded-pill border border-border px-2 py-0.5 text-[12px] text-ink-2">{t}</li>
                ))}
                {terms.length > 8 && <li className="px-1 text-[12px] text-ink-3">+{terms.length - 8} more</li>}
              </ul>
              <div className={cn('mt-auto border-t border-border pt-3')}>
                <ClusterScores domain={domain} id={c.id} name={c.name} businessValue={c.businessValue} rankingChance={c.rankingChance} />
              </div>
            </li>
          );
        })}
      </ul>
      {clusters.length > limit && <p className="text-[13px] text-ink-3">Showing the top {limit} of {clusters.length} clusters. The CSV export has every keyword with its cluster.</p>}
    </div>
  );
}
