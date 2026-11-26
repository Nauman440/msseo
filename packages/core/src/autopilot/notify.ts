import { localParts } from './schedule';
import type { RunSummary } from './run';
import type { WorkItem } from './work-items';

/**
 * WordPress autopilot, phase 5: which emails to send. The customer hears from the autopilot only
 * when they must act (approve, finish something by hand, or fix a problem), plus a short Friday
 * summary and a monthly one when something changed. Every email has a key, so it is sent once.
 */
export type EmailKind = 'action_needed' | 'critical' | 'friday_summary' | 'monthly_summary';
export type EmailLogEntry = { key: string; kind: EmailKind; to: string; subject: string; sentAt: string; ok: boolean };
export type PlannedEmail = {
  key: string;
  kind: EmailKind;
  /** customer = the site's owner; team = TEAM_NOTIFY_EMAIL (critical only). */
  audience: 'customer' | 'team';
  subject: string;
  heading: string;
  paragraphs: string[];
  /** App path for the button (the Changes tab). */
  path: string;
};

export type NotifyInput = {
  domain: string;
  items: WorkItem[];
  runs: RunSummary[];
  log: EmailLogEntry[];
  mode: 'auto' | 'approve';
  timezone: string;
  /** Problems found outside a run (connection lost, search engines discouraged, a change undone after a ranking drop). */
  problems: { key: string; message: string }[];
  /** Where the customer sees the changes (path in the app). */
  path: string;
  now?: Date;
};

const sent = (log: EmailLogEntry[], key: string) => log.some((e) => e.key === key && e.ok);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Short, stable fingerprint of a list of ids (so the same open items are not emailed twice). */
function fingerprint(ids: string[]): string {
  let h = 2166136261;
  for (const c of [...ids].sort().join(',')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}

export function plannedEmails(n: NotifyInput): PlannedEmail[] {
  const now = n.now ?? new Date();
  const local = localParts(now, n.timezone);
  const out: PlannedEmail[] = [];
  const site = n.domain;

  // Critical: the autopilot stopped itself or undid a run.
  for (const r of n.runs.slice(0, 5)) {
    if (!r.paused && !r.rolledBack && !(r.laterCheck && !r.laterCheck.ok)) continue;
    const key = `critical:${r.id}:${r.laterCheck && !r.laterCheck.ok ? 'later' : 'run'}`;
    if (sent(n.log, `${key}:customer`)) continue;
    const why = r.laterCheck && !r.laterCheck.ok ? r.laterCheck.problems : r.problems;
    for (const audience of ['customer', 'team'] as const) {
      out.push({
        key: `${key}:${audience}`, kind: 'critical', audience, path: n.path,
        subject: `Autopilot paused on ${site}`,
        heading: r.rolledBack || (r.laterCheck && !r.laterCheck.ok) ? 'We undid today’s website changes' : 'The autopilot paused itself',
        paragraphs: [
          r.rolledBack || (r.laterCheck && !r.laterCheck.ok) ? `After the changes on ${site}, a page looked worse, so every change from that run was undone automatically.` : `The autopilot on ${site} stopped before finishing.`,
          ...why.slice(0, 4),
          'Nothing more will be changed until someone presses “Start implementing plan” again on the Changes tab.',
        ],
      });
    }
  }
  for (const p of n.problems) {
    const key = `critical:${p.key}`;
    if (sent(n.log, `${key}:customer`)) continue;
    for (const audience of ['customer', 'team'] as const) out.push({ key: `${key}:${audience}`, kind: 'critical', audience, path: n.path, subject: `Action needed on ${site}`, heading: 'Something needs your attention', paragraphs: [p.message] });
  }

  // Action needed: approvals waiting, changes only a person can make, tasks for the client.
  const waiting = n.mode === 'approve' ? n.items.filter((i) => i.status === 'draft' && !i.approvedAt && !['gsc_sitemap_submit', 'ai_visibility_check', 'weekly_page_check'].includes(i.type)) : [];
  const byHand = n.items.filter((i) => i.status === 'needs_human');
  const client = n.items.filter((i) => i.status === 'client');
  const ids = [...waiting, ...byHand, ...client].map((i) => i.id);
  if (ids.length) {
    const key = `action:${fingerprint(ids)}`;
    const today = n.log.some((e) => e.kind === 'action_needed' && e.ok && localParts(new Date(e.sentAt), n.timezone).date === local.date);
    if (!sent(n.log, key) && !today) {
      const lines = [
        waiting.length ? `${plural(waiting.length, 'change')} waiting for your approval.` : '',
        byHand.length ? `${plural(byHand.length, 'change')} we could not make automatically (for example on page-builder pages). Each has the drafted text, ready to paste.` : '',
        client.length ? `${plural(client.length, 'task')} for you, such as ${client.slice(0, 2).map((i) => `“${i.label}”`).join(' and ')}.` : '',
      ].filter(Boolean);
      out.push({ key, kind: 'action_needed', audience: 'customer', path: n.path, subject: `${plural(ids.length, 'thing')} to do on ${site}`, heading: 'Your website needs you for a few minutes', paragraphs: [...lines, 'Everything else is handled by the autopilot.'] });
    }
  }

  // Manual tasks for the team (outreach, reviews, articles…): the team hears about them; they never block the queue.
  const forTeam = n.items.filter((i) => i.status === 'team' || i.status === 'developer');
  if (forTeam.length) {
    const key = `team:${fingerprint(forTeam.map((i) => i.id))}`;
    if (!sent(n.log, key)) {
      out.push({ key, kind: 'action_needed', audience: 'team', path: n.path, subject: `${plural(forTeam.length, 'task')} for the team on ${site}`, heading: 'Tasks the autopilot passed to the team', paragraphs: [...forTeam.slice(0, 8).map((i) => `• ${i.label}${i.status === 'developer' ? ' (developer)' : ''}`), ...(forTeam.length > 8 ? [`…and ${forTeam.length - 8} more.`] : []), 'The autopilot carried on with the next tasks.'] });
    }
  }

  // Friday summary (after the run), only when something changed this week.
  if (local.weekday === 5) {
    const weekAgo = now.getTime() - 6 * 86_400_000;
    const done = n.items.filter((i) => i.appliedAt && Date.parse(i.appliedAt) >= weekAgo && ['applied', 'verified'].includes(i.status));
    const key = `friday:${local.date}`;
    if (done.length && !sent(n.log, key)) {
      out.push({
        key, kind: 'friday_summary', audience: 'customer', path: n.path,
        subject: `This week on ${site}: ${plural(done.length, 'improvement')}`,
        heading: 'What the autopilot did this week',
        paragraphs: [`${plural(done.length, 'change')} made and checked on your live pages:`, ...done.slice(0, 8).map((i) => `• ${i.label}`), ...(done.length > 8 ? [`…and ${done.length - 8} more.`] : []), 'Every change can be undone with one click on the Changes tab.'],
      });
    }
  }

  // Monthly summary on the 1st, for the month before.
  if (local.date.endsWith('-01')) {
    const month = new Date(Date.parse(`${local.date}T12:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 7);
    const done = n.items.filter((i) => i.appliedAt?.startsWith(month) && ['applied', 'verified'].includes(i.status));
    const key = `month:${month}`;
    if (done.length && !sent(n.log, key)) {
      const undone = n.items.filter((i) => i.status === 'rolled_back' && i.appliedAt?.startsWith(month)).length;
      out.push({ key, kind: 'monthly_summary', audience: 'customer', path: n.path, subject: `Your autopilot month on ${site}`, heading: `Last month: ${plural(done.length, 'change')} on your website`, paragraphs: [`${plural(done.length, 'change')} made and checked live${undone ? `, ${undone} undone` : ''}.`, 'We measure each change at 7, 14 and 28 days and undo any that hurt your Google rankings.'] });
    }
  }
  return out;
}

/** Keeps the newest 100 entries. */
export const appendEmailLog = (log: EmailLogEntry[], e: EmailLogEntry) => [e, ...log].slice(0, 100);
