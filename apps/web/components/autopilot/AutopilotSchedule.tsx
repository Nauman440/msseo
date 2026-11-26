import { localParts, type WorkItem } from '@seo/core';
import type { AutopilotState } from '@/lib/autopilot-wp';
import { AutopilotSettingsForm, StartOverForm } from './forms';

/**
 * The schedule and safety settings of one site's autopilot, when the next run is, and (team) the
 * emails it sent. Shown inside the "Make this month's changes" card.
 */
const ZONES = ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];
const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The next working day and hour the scheduled run happens, in plain words. */
export function nextRunText(s: AutopilotState, now = new Date()): string | null {
  if (!s.settings.enabled) return null;
  for (let d = 0; d < 8; d++) {
    const t = new Date(now.getTime() + d * 86_400_000);
    const l = localParts(t, s.settings.timezone);
    if (l.weekday > 5 || (d === 0 && s.lastRunDate === l.date)) continue;
    if (d === 0 && l.hour >= s.settings.runHour) return 'Next run within 15 minutes.';
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : DAY[l.weekday];
    return `Next run ${when} at ${String(s.settings.runHour).padStart(2, '0')}:00 (${s.settings.timezone.replace(/_/g, ' ')}).`;
  }
  return null;
}

/** The newest result check of a change, in plain words. */
export function resultText(i: WorkItem): string | null {
  const c = i.checks?.at(-1);
  if (!c) return null;
  const words = { better: 'doing better on Google', same: 'no change on Google yet', worse: 'did worse on Google', too_little_data: 'too few Google visits to measure yet' }[c.verdict];
  return `After ${c.day} days: ${words}${c.before.position !== null && c.after.position !== null ? ` (position ${c.before.position} → ${c.after.position})` : ''}.`;
}

export function AutopilotSchedule({ domain, state: s, audience }: { domain: string; state: AutopilotState; audience: 'team' | 'customer' }) {
  const next = nextRunText(s);
  const sent = s.emails.slice(0, 15);
  return (
    <details className="rounded-[14px] border border-border">
      <summary className="cursor-pointer px-5 py-3">
        <span className="font-semibold">Schedule and safety</span>{' '}
        <span className="text-[13px] text-ink-2">{s.settings.enabled ? next ?? 'Runs on working days.' : 'Runs only when the button is pressed.'}{s.settings.mode === 'approve' ? ' Waits for approval.' : ''}</span>
      </summary>
      <div className="flex flex-col gap-5 border-t border-border p-5">
        <AutopilotSettingsForm domain={domain} settings={s.settings} zones={ZONES} />
        <p className="text-[13px] text-ink-2">
          Every change is checked on the live page straight away, again an hour after the run, and measured in Google at 7, 14 and 28 days. A change that makes a page break or lose rankings is undone automatically, and you get an email. You can also pause everything from WordPress (MS SCORE Autopilot page).
        </p>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Start over</h3>
          <StartOverForm domain={domain} />
        </div>
        {audience === 'team' && sent.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Emails sent</h3>
            <ul className="divide-y divide-border rounded-[12px] border border-border text-[13px]">
              {sent.map((e) => (
                <li key={`${e.key}-${e.sentAt}`} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                  <span className="min-w-0 break-words">{e.subject}</span>
                  <span className="text-ink-2">{e.to === 'team' ? 'Team' : 'Customer'} · {e.sentAt.slice(0, 16).replace('T', ' ')} UTC{e.ok ? '' : ' · not sent'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
