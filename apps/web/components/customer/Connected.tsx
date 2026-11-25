import Link from 'next/link';
import type { PlanRow, ReportModel } from '@seo/core';
import type { GoogleStatus, SiteGoogleData } from '@/lib/customer-google';
import { cn } from '@/lib/tones';

/** Dashboard after Google is connected (design: "Dashboard redesign overview after connecting"). */
const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '–' : n.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }));
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <li className="rounded-[14px] border border-border bg-surface p-[18px]">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-ink-2">{label}</p>
      <p className="mt-2 font-display text-[32px] font-extrabold leading-none tabular">{value}</p>
      <p className="mt-2.5 text-[13px] text-ink-2">{hint}</p>
    </li>
  );
}

export function ConnectedTiles({ report, data, google, domain }: { report?: ReportModel; data: SiteGoogleData; google: GoogleStatus; domain: string }) {
  return (
    <ul aria-label="Your numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="SEO health" value={report ? String(report.overall.score) : '–'} hint={report ? `Out of 100 · last audit ${day(report.crawledAt)}` : 'Run an audit to see it'} />
      <Tile label="Clicks from Google" value={fmt(data.clicks)} hint="Last 28 days" />
      <Tile label="Average position" value={fmt(data.position, 1)} hint="Lower is better" />
      {google.site?.ga4Property ? (
        <Tile label="Leads tracked" value={fmt(data.ga4?.keyEvents)} hint={`Key events, last 28 days${data.ga4 ? ` · ${fmt(data.ga4.sessions)} visits` : ''}`} />
      ) : (
        <li className="rounded-[14px] border border-dashed border-border-strong bg-[#FAF8F4] p-[18px]">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-ink-2">Leads tracked</p>
          <Link href={`/my/connect?site=${encodeURIComponent(domain)}`} className="mt-3 inline-block text-sm font-semibold text-primary-heading underline">
            Connect Analytics
          </Link>
          <p className="mt-2 text-[13px] text-ink-2">Counts calls and form leads</p>
        </li>
      )}
    </ul>
  );
}

const CHIP: Record<string, string> = { 'New page': 'bg-primary-chip text-primary-heading' };

export function PlanTable({ rows, compact = false }: { rows: PlanRow[]; compact?: boolean }) {
  if (!rows.length) return <p className="text-sm text-ink-2">No searches between positions 4 and 20 with enough impressions yet. As Google shows your pages more often, they appear here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-2">
            <th className="px-2.5 py-2.5">Search</th>
            <th className="px-2.5 py-2.5 text-center">Position</th>
            <th className="px-2.5 py-2.5">Page</th>
            <th className="px-2.5 py-2.5">What we will do</th>
            {!compact && <th className="px-2.5 py-2.5 text-right">Impressions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.query} className="border-b border-border align-middle last:border-0">
              <td className="px-2.5 py-3.5 font-semibold">{r.query}</td>
              <td className="px-2.5 py-3.5 text-center font-display text-base font-extrabold tabular">{Math.round(r.position)}</td>
              <td className="px-2.5 py-3.5 font-mono text-[12px] text-ink-2">{r.page ? new URL(r.page).pathname : 'No page yet'}</td>
              <td className="px-2.5 py-3.5">
                <span className="flex flex-wrap gap-1">
                  {r.actions.map((a) => (
                    <span key={a} className={cn('rounded-full px-2 py-0.5 text-xs font-bold', CHIP[a] ?? 'bg-sunken text-ink-2')}>{a}</span>
                  ))}
                </span>
              </td>
              {!compact && <td className="px-2.5 py-3.5 text-right tabular">{r.impressions.toLocaleString('en-GB')}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-ink-2">
        Title: a better page title · Description: a better search snippet · Answer: a short direct answer for Google and AI search · Links: links from related pages · Section: content the top results cover that you do not · New page: a page for a search with no page yet
      </p>
    </div>
  );
}

export function PlanCard({ rows }: { rows: PlanRow[] }) {
  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return (
    <section aria-labelledby="week-plan" className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
      <div>
        <h2 id="week-plan" className="font-display text-xl font-bold">
          This week&apos;s plan <span className="font-sans text-sm font-normal text-ink-2">week of {day(monday.toISOString())}</span>
        </h2>
        <p className="mt-1 text-sm text-ink-2">The five searches closest to page 1, and what to do for each.</p>
      </div>
      <PlanTable rows={rows} compact />
    </section>
  );
}

export function AlertsCard({ report, latestId }: { report?: ReportModel; latestId: string | null }) {
  const urgent = (report?.issues ?? []).filter((i) => i.severity === 'critical' || i.severity === 'high').slice(0, 3);
  return (
    <section aria-labelledby="alerts" className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-6">
      <h2 id="alerts" className="font-display text-xl font-bold">Alerts</h2>
      {urgent.length ? (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {urgent.map((i) => (
            <li key={i.ruleId} className="flex items-start gap-3 py-3">
              <span className={cn('rounded-[6px] px-2 py-0.5 text-xs font-bold', i.severity === 'critical' ? 'bg-fail-bg text-fail-text' : 'bg-high-bg text-high-text')}>{i.severity === 'critical' ? 'Urgent' : 'High'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{i.message.client}</p>
                {report && <p className="text-xs text-ink-2">Found in the audit of {day(report.crawledAt)}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">Nothing urgent in your latest audit.</p>
      )}
      {latestId && (
        <Link href={`/my/reports/${latestId}`} className="text-sm font-semibold text-primary-heading underline">
          All issues
        </Link>
      )}
    </section>
  );
}

function Row({ name, state }: { name: string; state: 'on' | 'off' | 'soon' }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2.5 text-[15px]">
        <span aria-hidden className={cn('size-2.5 rounded-full', state === 'on' ? 'bg-teal' : state === 'off' ? 'bg-[#CA8A04]' : 'bg-border-strong')} />
        {name}
      </span>
      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', state === 'on' ? 'bg-teal-chip text-teal-text' : state === 'off' ? 'bg-amber-bg text-amber-text' : 'bg-sunken text-ink-2')}>
        {state === 'on' ? 'Connected' : state === 'off' ? 'Not connected' : 'Coming soon'}
      </span>
    </li>
  );
}

export function ConnectionsCard({ google, domain }: { google: GoogleStatus; domain: string }) {
  return (
    <section aria-labelledby="connections" className="flex flex-col gap-2 rounded-[18px] border border-border bg-surface p-6">
      <h2 id="connections" className="font-display text-xl font-bold">Connections</h2>
      <ul>
        <Row name="Search Console" state={google.site?.gscProperty ? 'on' : 'off'} />
        <Row name="Analytics 4" state={google.site?.ga4Property ? 'on' : 'off'} />
        <Row name="Website (WordPress)" state="soon" />
      </ul>
      <Link href={`/my/connections?site=${encodeURIComponent(domain)}`} className="mt-2 inline-flex min-h-11 items-center self-start rounded-control border border-border-strong px-5 text-[15px] font-semibold hover:border-ink-3">
        Manage connections
      </Link>
    </section>
  );
}
