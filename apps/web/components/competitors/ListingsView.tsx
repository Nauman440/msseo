import { hiddenReason, listingKind, type CompetitorRecord, type CompetitorWorkspace } from '@seo/core';
import { cn } from '@/lib/tones';
import { ListingButtons, MoveToCompetitors } from './controls';
import { CHIP, KIND_CHIP, KIND_LABEL, LISTING_CHIP, LISTING_LABEL, nextStep, whyItMatters } from './labels';

/** Sites that are listing or link targets rather than competitors (directories, review sites, publishers). */
export const isListing = (c: CompetitorRecord) => (c.type === 'directory' || c.type === 'publisher') && !hiddenReason(c);

/** "Listings and links" (design): where to be listed or mentioned, with a status per site. */
export function ListingsView({ ws }: { ws: CompetitorWorkspace }) {
  const total = ws.searches.length;
  const listings = ws.competitors.filter(isListing).sort((a, b) => Number(a.listing === 'irrelevant') - Number(b.listing === 'irrelevant') || b.seenIn - a.seenIn);
  const hidden = ws.competitors.filter((c) => hiddenReason(c));
  const count = (s: CompetitorRecord['listing']) => listings.filter((c) => (c.listing ?? 'unchecked') === s).length;
  const tiles = [
    { label: 'Listed and correct', value: count('listed'), tone: 'text-teal-text' },
    { label: 'Details wrong', value: count('wrong'), tone: 'text-chart-fail' },
    { label: 'Not listed yet', value: count('not_listed'), tone: 'text-amber-text' },
    { label: 'Not checked', value: count('unchecked'), tone: 'text-ink-2' },
  ];
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[22px] font-bold sm:text-[26px]">Listings and link targets</h2>
        <p className="max-w-[680px] text-[15px] leading-relaxed text-ink-2">
          Directories, review sites and publishers that show up for your searches. Being listed with correct details, or mentioned on them, helps you rank and helps AI assistants recommend you.
        </p>
      </div>
      {listings.length > 0 ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="flex flex-col-reverse rounded-[14px] border border-border bg-surface px-[18px] py-4">
                <dt className="text-[13px] font-semibold">{t.label}</dt>
                <dd className={cn('font-display text-[28px] font-extrabold tabular', t.tone)}>{t.value}</dd>
              </div>
            ))}
          </dl>
          <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {listings.map((c) => {
              const kind = listingKind(c);
              const status = c.listing ?? 'unchecked';
              return (
                <li key={c.domain} className={cn('flex flex-col gap-2.5 rounded-card border border-border bg-surface p-5', status === 'irrelevant' && 'opacity-70')}>
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <h3 className="break-words text-[17px] font-bold">
                        <a href={`https://${c.domain}/`} target="_blank" rel="noopener noreferrer" className="hover:text-primary-text hover:underline">{c.domain}</a>
                      </h3>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className={cn(CHIP, KIND_CHIP[kind])}>{KIND_LABEL[kind]}</span>
                        {total > 0 && <span className="py-[3px] text-[12px] text-ink-2">Seen in {c.seenIn} of {total} searches</span>}
                      </div>
                    </div>
                    <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold', LISTING_CHIP[status])}>{LISTING_LABEL[status]}</span>
                  </div>
                  <p className="text-sm leading-normal text-ink-2">{whyItMatters(c.domain, kind)}</p>
                  <p className="text-sm font-semibold leading-normal">{nextStep(status, kind)}</p>
                  <div className="mt-auto pt-1.5">
                    <ListingButtons domain={ws.domain} site={c.domain} status={status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="rounded-card border border-border bg-surface p-6 text-sm text-ink-2">No directories or publishers yet. They appear after “Find competitors”.</p>
      )}
      {hidden.length > 0 && (
        <section aria-labelledby="hidden-title" className="flex flex-col gap-2.5 rounded-card border border-border bg-surface px-[22px] py-5">
          <h2 id="hidden-title" className="text-[17px] font-bold">Hidden from competitors</h2>
          <p className="text-sm leading-normal text-ink-2">These show up for your searches but are not businesses like yours, so we keep them out of reports.</p>
          <ul className="flex flex-wrap gap-2">
            {hidden.map((c) => (
              <li key={c.domain} className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas py-1.5 pl-3.5 pr-1.5 text-[13px] font-semibold">
                {c.domain}
                <span className="text-[12px] font-medium text-ink-2">{hiddenReason(c)}</span>
                <MoveToCompetitors domain={ws.domain} site={c.domain} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
