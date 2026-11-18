import type { CompetitorAnalysis } from '@seo/core';
import { AiAnswers, Recommendations } from './AiAndAdvice';
import { ComparisonTable, RankingGrid } from './ComparisonTable';
import { ContentGap, KeywordGap } from './GapSections';
import { RunAnalysis } from './RunAnalysis';
import { TopPages, Wins } from './TopPagesAndWins';

/**
 * Module 6 · Deep competitor analysis, the "Analysis" sub-tab of Competitors (team and customers).
 * Backlinks (6.4) come with Module 8.
 */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';

export function AnalysisView({ a, domain, audience, targets, nextRun, shortlistHref }: {
  a: CompetitorAnalysis | null;
  domain: string;
  audience: 'team' | 'customer';
  /** The shortlisted competitors the next run compares (direct first). */
  targets: string[];
  /** Customers: when the next run is allowed (null = now). */
  nextRun: Date | null;
  shortlistHref: string;
}) {
  const csv = (list: 'keywords' | 'content') => `/api/analysis/${domain}/csv?list=${list}`;
  const blocked = !targets.length
    ? null
    : nextRun
      ? `Next analysis available on ${nextRun.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.`
      : null;
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>{a ? `Last analysis · ${day(a.runAt)}${audience === 'team' ? ` · $${a.costUsd.toFixed(2)}` : ''}` : 'No analysis yet'}</p>
          <p className="text-[15px] font-semibold">
            {targets.length
              ? `Compares you with ${targets.length} shortlisted ${targets.length === 1 ? 'competitor' : 'competitors'}: ${targets.join(', ')}`
              : 'Shortlist your competitors first (Direct or Aspirational).'}
          </p>
          <p className="text-[13px] text-ink-2">
            Traffic and keywords, Google and map positions, Business Profiles, speed and pages, and what ChatGPT recommends.{' '}
            {audience === 'customer' ? 'You can run it once a month.' : 'About $0.60–0.80 per run.'}
          </p>
        </div>
        {targets.length ? (
          <RunAnalysis domain={domain} again={Boolean(a)} disabledReason={blocked} />
        ) : (
          <a href={shortlistHref} className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3">Go to the shortlist</a>
        )}
      </div>

      {a && (
        <>
          {a.notes.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">
              {a.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <Recommendations a={a} />
          <section aria-labelledby="compare-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
            <div>
              <h2 id="compare-title" className="font-display text-xl font-bold">Side by side</h2>
              <p className="mt-1 text-sm text-ink-2">Visits and keywords are estimates; speed values are lab tests of each homepage on a phone. The best value in each row is in green. Links from other websites come later, with backlinks.</p>
            </div>
            <ComparisonTable a={a} />
          </section>
          {a.grid.length > 0 && (
            <section aria-labelledby="grid-title" className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6">
              <div>
                <h2 id="grid-title" className="font-display text-xl font-bold">Where each of you shows up</h2>
                <p className="mt-1 text-sm text-ink-2">Your core searches on {day(a.runAt)}: position in the map pack and in the search results (page 1).</p>
              </div>
              <RankingGrid a={a} />
            </section>
          )}
          <KeywordGap a={a} csvHref={csv('keywords')} />
          <Wins a={a} />
          <TopPages a={a} />
          <ContentGap a={a} csvHref={csv('content')} />
          <AiAnswers a={a} />
        </>
      )}
    </div>
  );
}
