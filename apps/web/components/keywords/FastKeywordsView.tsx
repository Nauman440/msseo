import { removedLabel, type FastOpportunity, type FastResult, type FastTopic, type RemovedKeyword } from '@seo/core';
import { Volume } from '@/components/mapping/PagePlanCard';
import { cn } from '@/lib/tones';
import { ClientQuestions } from './ClientQuestions';

/**
 * Keywords tab (fast pipeline, 2026-11-25): four numbers, one card per topic (page, main keyword,
 * searches, position, opportunity, supporting keywords folded), the searches left out grouped by
 * reason, and up to 5 Yes/No questions. Reads the same saved result as the Page plan.
 */
const OPPORTUNITY: Record<FastOpportunity, { label: string; tone: string }> = {
  quick_win: { label: 'Quick win', tone: 'bg-primary-chip text-primary-heading' },
  new_page: { label: 'New page', tone: 'bg-violet-bg text-violet-text' },
  article: { label: 'Article', tone: 'bg-indigo-bg text-indigo-text' },
  optimise: { label: 'Improve the page', tone: 'bg-sunken text-ink-2' },
  top: { label: 'In the top 3', tone: 'bg-teal-chip text-teal-text' },
};
const CHIP = 'whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold';
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function TopicCard({ t }: { t: FastTopic }) {
  const o = OPPORTUNITY[t.opportunity];
  const rest = t.keywords.slice(1);
  return (
    <article aria-label={t.topic} className="flex min-w-0 flex-col gap-2.5 rounded-card border border-border bg-surface px-[18px] py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-[16px] font-bold">{t.topic}</h3>
        <span className={cn(CHIP, o.tone)}>{o.label}</span>
      </div>
      <p className="text-[13px] text-ink-2 [overflow-wrap:anywhere]">
        {t.isNew ? 'New page to create' : <>Page: <span className="font-semibold text-ink">{t.pageName}</span> <span className="font-mono text-[12px]">{t.pageUrl ? path(t.pageUrl) : ''}</span></>}
      </p>
      <p className="flex items-center justify-between gap-3 rounded-[12px] border border-primary-tint bg-primary-wash px-3.5 py-2.5">
        <strong className="min-w-0 break-words text-[15px]">“{t.mainKeyword}”</strong>
        <Volume volume={t.keywords[0]?.volume ?? null} />
      </p>
      <p className="text-[13px] text-ink-2 tabular">
        {t.volume.toLocaleString('en-US')} searches a month · {t.position === null ? 'not on Google yet' : `you are #${t.position}`}
      </p>
      {rest.length > 0 && (
        <details className="text-[13.5px]">
          <summary className="cursor-pointer font-semibold text-primary-text">{rest.length} supporting {rest.length === 1 ? 'keyword' : 'keywords'}</summary>
          <ul className="mt-1 divide-y divide-border border-t border-border">
            {rest.map((k) => (
              <li key={k.keyword} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 break-words">{k.keyword}{k.role === 'question' && <span className="ml-1.5 text-[11.5px] text-ink-3">question</span>}</span>
                <Volume volume={k.volume} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function LeftOut({ removed }: { removed: RemovedKeyword[] }) {
  if (!removed.length) return null;
  const groups = new Map<string, RemovedKeyword[]>();
  for (const r of removed) groups.set(r.reason, [...(groups.get(r.reason) ?? []), r]);
  return (
    <details className="group rounded-card border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-[22px] py-4 [&::-webkit-details-marker]:hidden">
        <span className="text-[16px] font-bold">Searches we left out ({removed.length.toLocaleString('en-US')})</span>
        <span className="text-sm font-semibold text-primary-text">Show</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-[22px]">
        {[...groups].sort((a, b) => b[1].length - a[1].length).map(([reason, list]) => (
          <div key={reason}>
            <h4 className="text-[14px] font-bold">{removedLabel(reason)} <span className="text-ink-2 tabular">({list.length})</span></h4>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{list.slice(0, 40).map((r) => r.keyword).join(' · ')}{list.length > 40 ? ` · and ${list.length - 40} more` : ''}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

export function FastKeywordsView({ domain, fast, audience }: { domain: string; fast: FastResult; audience: 'team' | 'customer' }) {
  const kept = fast.topics.reduce((s, t) => s + t.keywords.length, 0);
  const tiles = [
    { value: fast.topics.length, label: 'Topics', hint: 'One page each' },
    { value: kept, label: 'Keywords kept', hint: 'Only searches that can bring buyers' },
    { value: fast.topics.filter((t) => t.opportunity === 'quick_win').length, label: 'Quick wins', hint: 'You are already in positions 4–20', highlight: true },
    { value: fast.topics.filter((t) => t.isNew).length, label: 'Pages to create', hint: 'No page covers these yet' },
  ];
  return (
    <div className="flex flex-col gap-[22px]">
      <p className="text-[13px] text-ink-2">
        Last updated {day(fast.runAt)}
        {audience === 'team' && ` · ${(fast.totalMs / 1000).toFixed(1)} s · $${fast.costUsd.toFixed(2)}${fast.warm ? ' (saved data)' : ''} · ${fast.steps.map((s) => `${s.step} ${Math.round(s.ms / 100) / 10}s`).join(', ')}`}
      </p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={cn('rounded-[14px] border px-[18px] py-4', t.highlight ? 'border-primary-tint bg-primary-wash' : 'border-border bg-surface')}>
            <dt className="text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2">{t.label}</dt>
            <dd className="mt-1 font-display text-[30px] font-extrabold tabular">{t.value.toLocaleString('en-US')}</dd>
            <dd className="mt-0.5 text-[12.5px] text-ink-2">{t.hint}</dd>
          </div>
        ))}
      </dl>
      <ClientQuestions domain={domain} questions={fast.askClient} />
      {fast.topics.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-[15px] text-ink-2">No topics yet. Check the research inputs below, then press “Check for new keywords now”.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {fast.topics.map((t) => (
            <TopicCard key={t.id} t={t} />
          ))}
        </div>
      )}
      {audience === 'team' && fast.redirects.length > 0 && (
        <details className="rounded-card border border-border bg-surface px-[22px] py-4">
          <summary className="cursor-pointer text-[15px] font-bold">Old addresses to redirect ({fast.redirects.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-[13px] [overflow-wrap:anywhere]">
            {fast.redirects.map((r) => (
              <li key={r.from} className="font-mono">{path(r.from)} → {path(r.to)}</li>
            ))}
          </ul>
        </details>
      )}
      {audience === 'team' && fast.notes.length > 0 && <p className="text-[13px] text-ink-2">{fast.notes.join(' ')}</p>}
      <LeftOut removed={fast.removed} />
    </div>
  );
}
