import type { KeywordWorkspace } from '@seo/core';
import { KeywordRunButtons } from './forms';

/**
 * The top of the Keywords section, in plain words: what this list is, what autopilot did and when it
 * runs next, and the one or two buttons anyone needs.
 */
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Autopilot re-runs a site when its last run is this old (packages/db/src/autopilot.ts). */
const AUTOPILOT_DAYS = 30;

export function AutopilotPanel({ ws, kept, topics, audience }: { ws: KeywordWorkspace; kept: number; topics: number; audience: 'team' | 'customer' }) {
  const shop = ws.businessType === 'shop';
  const auto = ws.autopilot;
  const last = ws.lastRunAt ? new Date(ws.lastRunAt) : null;
  const next = auto ? new Date(new Date(auto.lastRunAt).getTime() + AUTOPILOT_DAYS * 86_400_000) : null;
  const hasInputs = ws.seeds.services.length > 0;

  const body = kept
    ? `We found ${kept.toLocaleString('en-US')} ${kept === 1 ? 'search' : 'searches'} worth going after and grouped them into ${topics} ${topics === 1 ? 'topic' : 'topics'}. Each topic is one page on your website. We left out searches that would not bring you ${shop ? 'buyers' : 'customers'}, such as job hunters, other towns, people looking for free help or ones you cannot win yet.`
    : hasInputs
      ? 'Autopilot is getting your keywords ready. This usually happens a few minutes after your first audit. You can also start it now.'
      : `Tell us what you ${shop ? 'sell' : 'offer'} (below) so we know what to look for.`;

  return (
    <section aria-labelledby="kw-intro" className="flex flex-col gap-4 rounded-card border border-border bg-surface p-[22px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${auto ? 'bg-teal-chip text-teal-text' : 'bg-sunken text-ink-2'}`}>{auto ? 'Autopilot on' : 'Updated by hand'}</span>
        {last && <span className="text-[13px] text-ink-2">Last updated {day(last)}{next ? ` · next automatic update around ${day(next)}` : ''}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 id="kw-intro" className="font-display text-[22px] font-bold tracking-[-0.01em]">What people type into Google to find {shop ? 'what you sell' : 'a business like yours'}</h2>
        <p className="max-w-[760px] text-[15px] leading-relaxed text-ink-2">{body}</p>
        {auto && kept > 0 && <p className="max-w-[760px] text-[14px] leading-relaxed text-ink-2">You do not need to do anything here: every month autopilot checks Google again, adds new searches and drops ones that stop being worth it.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {kept > 0 && (
          <a href={`/api/keywords/${ws.domain}/sheet`} download className="inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3">
            Download as a spreadsheet
          </a>
        )}
        {hasInputs && <KeywordRunButtons domain={ws.domain} hasKeywords={kept > 0} hasClusters={topics > 0} audience={audience} />}
      </div>
    </section>
  );
}
