import { analysisTargets, hiddenReason, type CompetitorAnalysis, type CompetitorWorkspace } from '@seo/core';
import { AnalysisView } from '@/components/analysis/AnalysisView';
import { Fold } from '@/components/ui/Fold';
import { SubTabs, withView } from '@/components/ui/SubTabs';
import { cn } from '@/lib/tones';
import { CompetitorIntro, InsightCards } from './CompetitorIntro';
import { AddCompetitorForm, CompetitorSettings } from './forms';
import { FoundTable } from './FoundTable';
import { competitorInsights } from './insights';
import type { CompetitorOpen, CompetitorView } from './labels';
import { isListing, ListingsView } from './ListingsView';
import { ShortlistCard, VersusTable } from './Shortlist';

/**
 * Module 3 and 6 for someone who knows nothing about SEO, in three sections:
 * - Your competitors: who you are up against (autopilot status), what we searched (folded), what we
 *   learned, the competitors we watch, you next to them, everyone we found (folded for customers once
 *   the shortlist exists) and adding one you know;
 * - Compare in detail: the deep analysis (Module 6);
 * - Get listed: directories, review sites and publishers.
 * The same for the team (any client) and customers (their own sites); the team also gets the costs.
 */
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const FOLD = 'group rounded-card border border-border bg-surface';
const FOLD_SUMMARY = 'flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-[22px] py-4 [&::-webkit-details-marker]:hidden';
const list = (items: string[], max = 3) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '));

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0 text-ink-2 transition-transform group-open:rotate-180">
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompetitorWorkspaceView({ ws, audience, base, view, open = null, gaps, links, analysis = null, nextRun = null, autopilotAt = null }: {
  ws: CompetitorWorkspace;
  audience: 'team' | 'customer';
  base: string;
  view: CompetitorView;
  open?: CompetitorOpen;
  /** Kept searches each competitor ranks for and the site does not (Module 4 keyword gap). */
  gaps: Record<string, number>;
  /** Where the "What we learned" cards point. */
  links: { gap: string; pagePlan: string; local: string | null };
  /** Module 6: the latest deep analysis, and (customers) when the next run is allowed. */
  analysis?: CompetitorAnalysis | null;
  nextRun?: Date | null;
  /** Last autopilot run for this site (keywords workspace); null = not on autopilot. */
  autopilotAt?: string | null;
}) {
  const href = (v: CompetitorView, extra: Record<string, string> = {}) => withView(base, v, 'competitors', extra);
  const listings = ws.competitors.filter(isListing);
  const hidden = ws.competitors.filter((c) => hiddenReason(c));
  const rivals = ws.competitors.filter((c) => !isListing(c) && !hiddenReason(c));
  const shortlist = rivals.filter((c) => c.shortlist !== 'none').sort((a, b) => (a.shortlist === b.shortlist ? b.seenIn - a.seenIn : a.shortlist === 'direct' ? -1 : 1));
  const insights = competitorInsights(ws, gaps, { ...links, analysis: href('analysis') });
  const moved = [
    hidden.length ? `${hidden.length} ${hidden.length === 1 ? 'job board, big shop or information site' : 'job boards, big shops and information sites'}` : '',
    listings.length ? `${listings.length} ${listings.length === 1 ? 'directory or publisher' : 'directories and publishers'}` : '',
  ].filter(Boolean);
  const unchecked = rivals.filter((c) => c.shortlist === 'none' && !c.rejected).length;
  // The full list is the work area until something is watched; then customers see it folded.
  const listOpen = open === 'all' || audience === 'team' || !shortlist.length;

  return (
    <div className="flex flex-col gap-[22px]">
      <SubTabs
        label="Competitor sections"
        active={view}
        tabs={[
          { key: 'competitors', label: 'Your competitors', count: rivals.length, href: href('competitors') },
          { key: 'analysis', label: 'Compare in detail', href: href('analysis') },
          { key: 'listings', label: 'Get listed', count: listings.length, href: href('listings') },
        ]}
      />

      {view === 'competitors' && (
        <>
          <CompetitorIntro ws={ws} rivals={rivals.length} watching={shortlist.length} audience={audience} autopilotAt={autopilotAt} />

          <Fold id="searches" defaultOpen={open === 'searches' || !ws.searches.length} className={cn(FOLD, 'scroll-mt-24')}>
            <summary className={FOLD_SUMMARY}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={EYEBROW}>What we searched</span>
                <span className="break-words text-[15px] font-semibold">{ws.searches.length ? `${list(ws.searches)} · ${ws.country}` : 'Nothing yet: add what your customers type into Google'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-heading">Change <Chevron /></span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-border px-[22px] py-5">
              <p className="max-w-2xl text-sm text-ink-2">
                {audience === 'team'
                  ? 'Labs competitors for the domain, plus the top 10 results and the map for every search. About $0.02 + $0.002 per search; the 12-month trend ≈ $0.15 per watched competitor.'
                  : 'We type each of these into Google, like a customer would, and note every business that shows up, in the results and in the map. Fix or add searches, save, and the next check uses them.'}
              </p>
              <CompetitorSettings domain={ws.domain} country={ws.country} language={ws.language} searches={ws.searches} />
            </div>
          </Fold>

          <InsightCards insights={insights} />

          {rivals.length > 0 && <ShortlistCard domain={ws.domain} competitors={rivals} autopilot={Boolean(autopilotAt)} />}
          <VersusTable domain={ws.domain} own={ws.own ?? null} shortlist={shortlist} searches={ws.searches.length} />

          {rivals.length ? (
            <Fold id="all-competitors" defaultOpen={listOpen} className={cn(FOLD, 'scroll-mt-24')}>
              <summary className={FOLD_SUMMARY}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[17px] font-bold">Everyone we found ({rivals.length.toLocaleString('en-US')})</span>
                  <span className="text-[13.5px] text-ink-2">
                    {unchecked ? `${unchecked} not checked yet. ` : ''}For each one, say what it is to you: a main competitor, a bigger name to learn from, or not a competitor.
                  </span>
                </span>
                <Chevron />
              </summary>
              <div className="border-t border-border p-[22px]">
                <FoundTable domain={ws.domain} rivals={rivals} searches={ws.searches.length} />
              </div>
            </Fold>
          ) : (
            <p className="rounded-card border border-border bg-surface p-6 text-sm text-ink-2">
              No competitors yet. {ws.searches.length ? 'Press “Find my competitors now”, or add one you know below.' : 'Add what your customers search for first.'}
            </p>
          )}
          {moved.length > 0 && (
            <p className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm leading-normal text-ink-2">
              We left out {moved.join(' and ')}: they show up for your searches but are not businesses like yours.{' '}
              <a href={href('listings')} className="font-semibold text-primary-heading">See them under Get listed</a>
            </p>
          )}

          <section id="add" aria-labelledby="add-title" className="flex scroll-mt-24 flex-col gap-3 rounded-card border border-border bg-surface p-[22px]">
            <div>
              <h2 id="add-title" className="text-[17px] font-bold">Add a competitor you know</h2>
              <p className="mt-0.5 text-[13.5px] text-ink-2">A business your customers mention, even if Google does not show it for these searches.</p>
            </div>
            <AddCompetitorForm domain={ws.domain} />
          </section>
        </>
      )}

      {view === 'listings' && <ListingsView ws={ws} />}

      {view === 'analysis' && (
        <AnalysisView a={analysis} domain={ws.domain} audience={audience} targets={analysisTargets(ws).map((c) => c.domain)} nextRun={nextRun} shortlistHref={href('competitors')} />
      )}
    </div>
  );
}
