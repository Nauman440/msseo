import { hiddenReason, type CompetitorWorkspace } from '@seo/core';
import { SubTabs, withView } from '@/components/ui/SubTabs';
import { AddCompetitorForm, CompetitorSettings, RunButtons } from './forms';
import { FoundTable } from './FoundTable';
import type { CompetitorView } from './labels';
import { isListing, ListingsView } from './ListingsView';
import { ShortlistCard, VersusTable } from './Shortlist';

/**
 * Module 3 workspace in the competitor design (design-reference/Competitors tab *.zip): sub-tabs
 * Competitors · Listings and links · Where to look. The same for the team (any client) and for
 * customers (their own sites).
 */
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';

export function CompetitorWorkspaceView({ ws, audience, base, view, gaps, gapHref }: {
  ws: CompetitorWorkspace;
  audience: 'team' | 'customer';
  base: string;
  view: CompetitorView;
  /** Kept searches each competitor ranks for and the site does not (Module 4 keyword gap). */
  gaps: Record<string, number>;
  gapHref: string;
}) {
  const href = (v: CompetitorView) => withView(base, v, 'competitors');
  const listings = ws.competitors.filter(isListing);
  const hidden = ws.competitors.filter((c) => hiddenReason(c));
  const rivals = ws.competitors.filter((c) => !isListing(c) && !hiddenReason(c));
  const shortlist = rivals.filter((c) => c.shortlist !== 'none').sort((a, b) => (a.shortlist === b.shortlist ? b.seenIn - a.seenIn : a.shortlist === 'direct' ? -1 : 1));
  const n = ws.searches.length;
  const moved = [
    hidden.length ? `${hidden.length} ${hidden.length === 1 ? 'site' : 'sites'} such as job boards and shops` : '',
    listings.length ? `${listings.length} ${listings.length === 1 ? 'directory or publisher' : 'directories and publishers'}` : '',
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-[22px]">
      <SubTabs
        label="Competitor sections"
        active={view}
        tabs={[
          { key: 'competitors', label: 'Competitors', count: rivals.length, href: href('competitors') },
          { key: 'listings', label: 'Listings and links', count: listings.length, href: href('listings') },
          { key: 'where', label: 'Where to look', href: href('where') },
        ]}
      />

      {view === 'competitors' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
            <div className="flex flex-col gap-1">
              <p className={EYEBROW}>{ws.lastRunAt ? `Last search · ${day(ws.lastRunAt)}` : 'No search yet'}</p>
              <p className="text-[15px] font-semibold">
                {n ? `${n} ${n === 1 ? 'search' : 'searches'} checked in ${ws.country}, including map results` : 'Add the searches your customers type under “Where to look”.'}
              </p>
            </div>
            <RunButtons domain={ws.domain} canRefresh={audience === 'team' && shortlist.length > 0} hasRun={Boolean(ws.lastRunAt)} changeHref={href('where')} />
          </div>

          <ShortlistCard domain={ws.domain} competitors={rivals} />
          <VersusTable domain={ws.domain} own={ws.own ?? null} shortlist={shortlist} gaps={gaps} gapHref={gapHref} />

          {rivals.length ? (
            <FoundTable domain={ws.domain} rivals={rivals} searches={n} />
          ) : (
            <p className="rounded-card border border-border bg-surface p-6 text-sm text-ink-2">No competitors yet. Press “Find competitors”, or add one you know below.</p>
          )}
          {moved.length > 0 && (
            <p className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm leading-normal text-ink-2">
              We moved {moved.join(' and ')} out of this list, because they show up for your searches but are not businesses like yours.{' '}
              <a href={href('listings')} className="font-semibold text-primary-heading">See them in Listings and links</a>
            </p>
          )}

          <section aria-labelledby="add-title" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[22px]">
            <h2 id="add-title" className="font-display text-lg font-bold">Add a competitor you know</h2>
            <AddCompetitorForm domain={ws.domain} />
          </section>
        </>
      )}

      {view === 'listings' && <ListingsView ws={ws} />}

      {view === 'where' && (
        <section aria-labelledby="where-title" className="flex flex-col gap-5 rounded-card border border-border bg-surface p-[22px]">
          <div>
            <p className={EYEBROW}>{ws.lastRunAt ? `Last search · ${day(ws.lastRunAt)}` : 'No search yet'}</p>
            <h2 id="where-title" className="mt-1 font-display text-xl font-bold">Where to look</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">
              {audience === 'team'
                ? 'Labs competitors for the domain, plus the top 10 results and the map pack for every search. About $0.02 + $0.002 per search; strength (12-month trend) ≈ $0.15 per shortlisted competitor.'
                : 'We check Google for each of these searches, including the map listings, and look up sites that rank for the same words as you. Save, then press “Find competitors again”.'}
            </p>
          </div>
          <CompetitorSettings domain={ws.domain} country={ws.country} language={ws.language} searches={ws.searches} />
        </section>
      )}
    </div>
  );
}
