import { shortlistStatus, SHORTLIST_TARGET, type CompetitorRecord, type CompetitorWorkspace } from '@seo/core';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/tones';
import { AddCompetitorForm, CompetitorControls, CompetitorSettings, RunButtons } from './forms';
import { Sparkline } from './Sparkline';

/**
 * Module 3 workspace (spec §16.2), the same for the team (any client) and for customers
 * (their own sites). `audience` only changes the wording.
 */
const TYPE_TONE: Record<CompetitorRecord['type'], string> = {
  direct: 'bg-fail-bg text-fail-text',
  local: 'bg-high-bg text-high-text',
  search: 'bg-primary-soft text-primary-text',
  directory: 'bg-info-bg text-info-text',
  publisher: 'bg-info-bg text-info-text',
};
const TYPE_NAME: Record<CompetitorRecord['type'], string> = { direct: 'Direct', local: 'Local (map)', search: 'Search only', directory: 'Directory', publisher: 'Publisher' };
const n = (v: number | null) => (v === null ? '–' : Math.round(v).toLocaleString('en-US'));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'never');

export function CompetitorWorkspaceView({ ws, audience }: { ws: CompetitorWorkspace; audience: 'team' | 'customer' }) {
  const rivals = ws.competitors.filter((c) => c.type !== 'directory' && c.type !== 'publisher');
  const listings = ws.competitors.filter((c) => c.type === 'directory' || c.type === 'publisher');
  const status = shortlistStatus(ws);
  const total = ws.searches.length;

  return (
    <div className="flex flex-col gap-6">
      <Card title="Where to look" eyebrow={`Last search: ${day(ws.lastRunAt)}`}>
        <div className="flex flex-col gap-6">
          <CompetitorSettings domain={ws.domain} country={ws.country} language={ws.language} searches={ws.searches} />
          <div className="border-t border-border pt-5">
            <RunButtons domain={ws.domain} canRefresh={status.direct + status.aspirational > 0} />
            <p className="mt-2 text-[13px] text-ink-3">
              {audience === 'team'
                ? 'Labs competitors for the domain, plus the top 10 results and the map pack for every search. About $0.01 + $0.002 per search; strength (12-month trend) ≈ $0.15 per shortlisted competitor.'
                : 'We check Google for each of your searches, including the map listings, and look up sites that rank for the same words as you.'}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Your shortlist" badge={<span className="text-[13px] text-ink-3 tabular">{status.direct} direct · {status.aspirational} aspirational</span>}>
        <p className="text-sm text-ink-2">
          Pick {SHORTLIST_TARGET.direct[0]}–{SHORTLIST_TARGET.direct[1]} <strong>direct</strong> competitors (same services, same area) and {SHORTLIST_TARGET.aspirational[0]}–{SHORTLIST_TARGET.aspirational[1]}{' '}
          <strong>aspirational</strong> ones (bigger sites you want to catch up with). They are tracked in every report and checked again every quarter.
        </p>
        {status.warnings.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {status.warnings.map((w) => (
              <li key={w} className="text-sm font-medium text-high-text">{w}</li>
            ))}
          </ul>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Competitors</h2>
        {rivals.length === 0 ? (
          <p className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-2">No competitors yet. Save your searches, then press “Find competitors”, or add one by hand below.</p>
        ) : (
          <>
          {/* Phones: one card per competitor, controls included (the table would scroll sideways). */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rivals.map((c) => (
              <li key={c.domain} className="rounded-panel border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`https://${c.domain}/`} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-ink hover:text-primary-text hover:underline">{c.domain}</a>
                  {c.isNew && <span className="rounded-pill bg-primary px-1.5 py-px text-[11px] font-bold text-primary-ink">New</span>}
                  <span className={cn('rounded-pill px-1.5 py-px text-[12px] font-semibold', TYPE_TONE[c.type])}>{TYPE_NAME[c.type]}</span>
                </div>
                {c.name && <p className="mt-0.5 text-[13px] text-ink-3">{c.name}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-ink-3">Seen in</dt>
                  <dd className="tabular">{total ? `${c.seenIn} of ${total} searches` : '–'}</dd>
                  <dt className="text-ink-3">Visits / month</dt>
                  <dd className="tabular">{n(c.etv)}</dd>
                  <dt className="text-ink-3">Keywords</dt>
                  <dd className="tabular">{n(c.keywords)}</dd>
                  <dt className="text-ink-3">12 months</dt>
                  <dd><Sparkline points={c.trend} label={c.domain} /></dd>
                </dl>
                <div className="mt-3 border-t border-border pt-3">
                  <CompetitorControls domain={ws.domain} competitor={c.domain} type={c.type} shortlist={c.shortlist} layout="card" />
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-panel border border-border bg-surface md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="px-4 py-3 font-semibold">Website</th>
                  <th className="px-3 py-3 font-semibold">Seen in</th>
                  <th className="px-3 py-3 font-semibold">Avg. position</th>
                  <th className="px-3 py-3 font-semibold">Visits / month</th>
                  <th className="px-3 py-3 font-semibold">Keywords</th>
                  <th className="px-3 py-3 font-semibold">12 months</th>
                  <th className="px-4 py-3 font-semibold">Type and shortlist</th>
                </tr>
              </thead>
              <tbody>
                {rivals.map((c) => (
                  <tr key={c.domain} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3">
                      <a href={`https://${c.domain}/`} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:text-primary-text hover:underline">{c.domain}</a>
                      {c.isNew && <span className="ml-2 rounded-pill bg-primary px-1.5 py-px text-[11px] font-bold text-primary-ink">New</span>}
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                        <span className={cn('rounded-pill px-1.5 py-px font-semibold', TYPE_TONE[c.type])}>{TYPE_NAME[c.type]}</span>
                        {c.name && <span>{c.name}</span>}
                        {audience === 'team' && c.sharedKeywords !== null && <span>{n(c.sharedKeywords)} shared keywords</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular">{total ? `${c.seenIn} of ${total}` : '–'}</td>
                    <td className="px-3 py-3 tabular">{c.avgPosition ?? '–'}</td>
                    <td className="px-3 py-3 tabular">{n(c.etv)}</td>
                    <td className="px-3 py-3 tabular">{n(c.keywords)}</td>
                    <td className="px-3 py-3"><Sparkline points={c.trend} label={c.domain} /></td>
                    <td className="px-4 py-3"><CompetitorControls domain={ws.domain} competitor={c.domain} type={c.type} shortlist={c.shortlist} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {listings.length > 0 && (
        <Card title="Listing and link targets" eyebrow="Directories, review sites and publishers">
          <p className="mb-3 text-sm text-ink-2">These sites show up for your searches but are not competitors. Being listed (with correct details) or mentioned on them helps you rank.</p>
          <ul className="flex flex-wrap gap-2">
            {listings.map((c) => (
              <li key={c.domain}>
                <a href={`https://${c.domain}/`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-strong px-3.5 text-sm font-semibold hover:border-ink-3">
                  {c.domain}
                  <span className="text-[12px] font-normal text-ink-3">{TYPE_NAME[c.type]}{total ? ` · ${c.seenIn}/${total}` : ''}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Add a competitor you know">
        <AddCompetitorForm domain={ws.domain} />
      </Card>
    </div>
  );
}
