import Link from 'next/link';
import { compareSnapshots, reportMonths, weeklySummary, type MonitorWorkspace } from '@seo/core';
import { KeywordsForm, MeetingForm, RunMonitor } from './forms';
import { AlertList, Card, ChangeTiles, RankTable, Trends } from './parts';

/** Module 13 · Monitoring dashboard (team: everything; customers: read-only with alerts and reports). */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const EYEBROW = 'text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-ink-2';
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function MonitorView({ ws, audience, customerSite, reportHref }: { ws: MonitorWorkspace; audience: 'team' | 'customer'; customerSite: boolean; reportHref: (month: string) => string }) {
  const last = ws.snapshots.at(-1);
  const summary = weeklySummary(ws);
  const open = ws.alerts.filter((a) => !a.resolvedAt);
  const months = reportMonths(ws);
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>{ws.state.lastDaily ? `Last check · ${day(ws.state.lastDaily)}` : ws.enabled ? 'First check tomorrow morning' : 'Monitoring is off'}</p>
          <p className="text-[15px] font-semibold">
            {ws.enabled ? 'Checked every morning (site up, hidden pages, robots.txt, traffic); rankings and a snapshot every Monday; a report on the 1st.' : 'Turn monitoring on to check this site every day and track its rankings every week.'}
          </p>
          {audience === 'team' && <p className="text-[13px] text-ink-2">Rank checks cost about $0.002 per search a week ({ws.ranks.keywords.length} tracked){customerSite ? ', counted in the autopilot budget.' : '.'}</p>}
        </div>
        {audience === 'team' && <RunMonitor domain={ws.domain} enabled={ws.enabled} customer={customerSite} />}
      </div>

      <Card id="alerts" title={`Alerts${open.length ? ` (${open.length} open)` : ''}`}>
        <AlertList domain={ws.domain} alerts={ws.alerts} limit={audience === 'team' ? 30 : 10} />
      </Card>

      {last ? (
        <>
          <Card id="week" title="This week" intro={summary.headline}>
            <ChangeTiles changes={compareSnapshots(last, ws.snapshots.at(-2))} against="last week" />
          </Card>
          {ws.baseline && ws.baseline.date !== last.date && (
            <Card id="baseline" title="Since we started" intro={`Against the starting point on ${day(ws.baseline.date)}.`}>
              <ChangeTiles changes={compareSnapshots(last, ws.baseline)} against="at the start" />
            </Card>
          )}
          <Card id="trends" title="Trends">
            <Trends snapshots={ws.snapshots} />
          </Card>
        </>
      ) : (
        <p className="rounded-[14px] border border-border bg-surface px-[18px] py-3.5 text-sm text-ink-2">The first snapshot (your starting point) is taken on the next Monday{audience === 'team' ? ', or now with “Run checks now”' : ''}.</p>
      )}

      <Card id="ranks" title="Rankings for the searches that matter" intro="Your place in Google’s top 10, checked every Monday.">
        <RankTable ws={ws} />
        {audience === 'team' && <KeywordsForm domain={ws.domain} keywords={ws.ranks.keywords} custom={ws.ranks.custom} />}
      </Card>

      <Card id="reports" title="Monthly reports">
        {months.length ? (
          <ul className="flex flex-wrap gap-2">
            {months.map((m) => (
              <li key={m}>
                <Link href={reportHref(m)} className="inline-flex min-h-10 items-center rounded-button border border-border-strong px-4 text-sm font-semibold hover:border-ink-3">{monthName(m)}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">The first report is ready once there is a weekly snapshot.</p>
        )}
      </Card>

      {audience === 'team' ? (
        <Card id="meeting" title="Review meetings" intro="When the team goes through this report with the client.">
          <MeetingForm domain={ws.domain} meeting={ws.meeting} />
        </Card>
      ) : (
        ws.meeting.next && (
          <Card id="meeting" title="Your next review meeting">
            <p className="text-sm">{day(ws.meeting.next)}{ws.meeting.notes ? ` · ${ws.meeting.notes}` : ''}</p>
          </Card>
        )
      )}
    </div>
  );
}
