import Link from 'next/link';
import { LOW_VOLUME, typedByHand, type BusinessType, type KeywordCluster, type KeywordRecord } from '@seo/core';
import { cn } from '@/lib/tones';
import { ClusterScores } from './forms';
import { CHIP, INTENT_CHIP, intentLabel, MONTH, PAGE_TYPE, type TopicOrder } from './labels';
import { TopicSort } from './TopicSort';

/** 4.5–4.6 "All topics by priority" (design): one card per topic with editable value and chance. */
export function sortTopics(clusters: KeywordCluster[], order: TopicOrder, now = new Date()): KeywordCluster[] {
  const monthsAway = (c: KeywordCluster) => (c.seasonalPeak ? (c.seasonalPeak - 1 - now.getUTCMonth() + 12) % 12 : 99);
  const by: Record<TopicOrder, (a: KeywordCluster, b: KeywordCluster) => number> = {
    priority: (a, b) => b.priority - a.priority || b.volume - a.volume,
    volume: (a, b) => b.volume - a.volume,
    quick: (a, b) => Number(b.quickWin) - Number(a.quickWin) || b.priority - a.priority,
    season: (a, b) => monthsAway(a) - monthsAway(b) || b.priority - a.priority,
  };
  return [...clusters].sort(by[order]);
}

export function ClusterBoard({ domain, clusters, keywords, order, showAll, allHref, business = 'services', limit = 6 }: {
  domain: string;
  clusters: KeywordCluster[];
  keywords: KeywordRecord[];
  order: TopicOrder;
  showAll: boolean;
  allHref: string;
  business?: BusinessType;
  limit?: number;
}) {
  const members = new Map<string, string[]>();
  for (const k of [...keywords].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))) if (k.clusterId && k.status === 'kept' && ((k.volume ?? 0) >= LOW_VOLUME || typedByHand(k))) members.set(k.clusterId, [...(members.get(k.clusterId) ?? []), k.term]);
  const sorted = sortTopics(clusters, order);
  const shown = showAll ? sorted : sorted.slice(0, limit);
  return (
    <section aria-labelledby="all-topics" className="flex flex-col gap-3.5">
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="all-topics" className="font-display text-[22px] font-bold sm:text-[26px]">All {clusters.length} {clusters.length === 1 ? 'topic' : 'topics'} by priority</h2>
          <p className="max-w-[680px] text-[15px] leading-relaxed text-ink-2">Priority = value to you × chance to rank, each from 1 to 5. Change either one and the order updates.</p>
        </div>
        <TopicSort value={order} />
      </div>
      <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const terms = members.get(c.id) ?? [];
          const intent = intentLabel(c.intent, business);
          return (
            <li key={c.id} className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-[18px]">
              <div className="flex items-start justify-between gap-2.5">
                <h3 className="min-w-0 break-words text-base font-bold leading-snug">{c.name}</h3>
                <span title="Priority score" className="shrink-0 rounded-[8px] bg-night px-[9px] py-1 font-display text-[13px] font-extrabold text-white tabular">{c.priority}/25</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.quickWin && <span className={cn(CHIP, 'bg-primary-chip text-primary-heading')}>Quick win</span>}
                {c.longTerm && <span className={cn(CHIP, 'bg-indigo-bg text-indigo-text')}>Long-term</span>}
                {c.seasonalPeak && <span className={cn(CHIP, 'bg-amber-bg text-amber-text')}>Peaks in {MONTH[c.seasonalPeak - 1]}</span>}
                <span className={cn(CHIP, 'bg-sunken text-ink-2')}>{PAGE_TYPE[c.pageType]}</span>
                {intent && c.intent && <span className={cn(CHIP, INTENT_CHIP[c.intent])}>{intent}</span>}
              </div>
              <p className="text-[13px] text-ink-2 tabular">
                {c.volume.toLocaleString('en-US')} searches a month · {c.size} keyword{c.size === 1 ? '' : 's'}
                {c.bestPosition !== null && c.bestPosition <= 100 ? ` · you rank #${c.bestPosition}` : ''}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {terms.slice(0, 3).map((t) => (
                  <li key={t} className="rounded-[8px] border border-border bg-canvas px-2 py-1 text-[12.5px]">{t}</li>
                ))}
                {terms.length > 3 && <li className="px-0.5 py-1 text-[12.5px] text-ink-2">+{terms.length - 3} more</li>}
              </ul>
              <div className="mt-auto border-t border-border pt-3">
                <ClusterScores domain={domain} id={c.id} name={c.name} businessValue={c.businessValue} rankingChance={c.rankingChance} />
              </div>
            </li>
          );
        })}
      </ul>
      {!showAll && clusters.length > limit && (
        <div className="flex justify-center">
          <Link href={allHref} scroll={false} className="inline-flex min-h-12 items-center rounded-control border border-border-strong bg-surface px-5 text-[15px] font-semibold hover:border-ink-3">
            Show all {clusters.length} topics
          </Link>
        </div>
      )}
    </section>
  );
}
