import type { BacklinkWorkspace } from '@seo/core';
import { cn } from '@/lib/tones';
import { AddOutreachManual, AddToOutreach, OutreachEditor } from './forms';
import { CARD, CHIP, LINK_TYPE, pathOf, TD, TH } from './Sections';

/** Module 8: lost (8.5) and broken backlinks (8.6), mentions (8.7), the link gap (8.9) and outreach (8.10). */
const has = (ws: BacklinkWorkspace, d: string) => ws.outreach.some((o) => o.domain === d);

export function LostAndBroken({ ws, csvHref }: { ws: BacklinkWorkspace; csvHref: string }) {
  const a = ws.audit!;
  return (
    <section aria-labelledby="broken-title" className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="broken-title" className="font-display text-xl font-bold">Links you are losing</h2>
          <p className="mt-1 text-sm text-ink-2">Links to pages that no longer work give you nothing. Redirect each broken page to the page suggested here (also listed in your audit under rule 1.5.7).</p>
        </div>
        {a.broken.length > 0 && <a href={csvHref} className="inline-flex min-h-10 items-center rounded-control border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">Download CSV</a>}
      </div>
      {a.broken.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr><th className={TH}>Broken page on your site</th><th className={TH}>Linked from</th><th className={TH}>Redirect it to</th></tr></thead>
            <tbody>
              {a.broken.slice(0, 30).map((b) => (
                <tr key={`${b.from}|${b.to}`}>
                  <td className={cn(TD, 'break-all font-mono text-[12.5px]')}>{pathOf(b.to)} <span className={cn(CHIP, 'bg-high-bg text-high-strong')}>{b.toStatus ?? 'error'}</span></td>
                  <td className={cn(TD, 'break-all text-ink-2')}>{b.fromDomain}{b.anchor ? ` · “${b.anchor}”` : ''}</td>
                  <td className={cn(TD, 'break-all font-mono text-[12.5px] text-teal-text')}>{b.suggestion ? pathOf(b.suggestion) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-2">No links from other websites point to broken pages.</p>
      )}
      <p className="text-sm text-ink-2">
        <strong className="text-ink">Lost in the last 90 days:</strong>{' '}
        {a.lost.length ? `${a.lost.length} linking ${a.lost.length === 1 ? 'website' : 'websites'}, for example ${a.lost.slice(0, 5).map((l) => l.fromDomain).join(', ')}. Ask the strongest ones to put the link back.` : 'none found.'}
      </p>
    </section>
  );
}

export function GapAndMentions({ ws, csvHref }: { ws: BacklinkWorkspace; csvHref: string }) {
  const a = ws.audit!;
  return (
    <section aria-labelledby="gap-links-title" className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gap-links-title" className="font-display text-xl font-bold">Websites to get links from</h2>
          <p className="mt-1 text-sm text-ink-2">Sites that link to at least two of your direct competitors and not to you, and sites that mention you without a link.</p>
        </div>
        {a.gap.length > 0 && <a href={csvHref} className="inline-flex min-h-10 items-center rounded-control border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">Download CSV</a>}
      </div>
      {a.gap.length ? (
        <div className="relative max-h-[460px] overflow-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="sticky top-0 bg-surface"><tr><th className={TH}>Website</th><th className={TH}>Type</th><th className={TH}>Links to</th><th className={TH}><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {a.gap.map((g) => (
                <tr key={g.domain}>
                  <td className={cn(TD, 'break-all font-semibold')}>{g.domain}{g.rank !== null && <span className="ml-1.5 text-[12px] font-normal text-ink-3 tabular">strength {g.rank}</span>}</td>
                  <td className={cn(TD, 'text-ink-2')}>{LINK_TYPE[g.type]}</td>
                  <td className={cn(TD, 'text-[13px] text-ink-2')}>{g.linksTo.join(', ')}</td>
                  <td className={cn(TD, 'text-right')}><AddToOutreach domain={ws.domain} target={g.domain} source="gap" reason={`Links to ${g.linksTo.join(', ')}`} added={has(ws, g.domain)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-2">No link gap found yet (it needs at least two shortlisted direct competitors).</p>
      )}
      {a.mentions.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-[15px] font-bold">They mention you, but do not link</h3>
          <ul className="flex flex-col gap-2">
            {a.mentions.slice(0, 15).map((m) => (
              <li key={m.url} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0"><span className="font-semibold">{m.domain}</span> <span className="break-all text-ink-2">· {m.title ?? pathOf(m.url)}</span></span>
                <AddToOutreach domain={ws.domain} target={m.domain} source="mention" reason="Mentions you without a link" url={m.url} added={has(ws, m.domain)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const SOURCE: Record<string, string> = { gap: 'Link gap', mention: 'Mention', broken: 'Broken link', local: 'Local', manual: 'Added by hand' };

/** 8.10 The outreach list: who to ask for a link, with status. Outreach is sent by a person, never by the tool. */
export function Outreach({ ws, csvHref }: { ws: BacklinkWorkspace; csvHref: string }) {
  return (
    <section aria-labelledby="outreach-title" className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="outreach-title" className="font-display text-xl font-bold">Outreach list</h2>
          <p className="mt-1 text-sm text-ink-2">Who to ask for a link, and where each one stands. Emails are written and sent by a person, never by the tool.</p>
        </div>
        {ws.outreach.length > 0 && <a href={csvHref} className="inline-flex min-h-10 items-center rounded-control border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">Download CSV</a>}
      </div>
      {ws.outreach.length > 0 && (
        <ul className="flex flex-col">
          {ws.outreach.map((o) => (
            <li key={o.domain} className="flex flex-wrap items-start justify-between gap-3 border-t border-border py-3">
              <div className="min-w-0">
                <p className="break-all font-semibold">{o.domain} <span className={cn(CHIP, 'bg-sunken text-ink-2')}>{SOURCE[o.source]}</span></p>
                <p className="text-[13px] text-ink-2">{o.reason}{o.owner ? ` · ${o.owner}` : ''}{o.contact ? ` · ${o.contact}` : ''}</p>
                {o.notes && <p className="text-[13px] text-ink-3">{o.notes}</p>}
              </div>
              <OutreachEditor domain={ws.domain} o={o} />
            </li>
          ))}
        </ul>
      )}
      <AddOutreachManual domain={ws.domain} />
    </section>
  );
}
