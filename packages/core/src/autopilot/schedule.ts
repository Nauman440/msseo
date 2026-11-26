import { pageKey } from './generate';
import type { WorkItem } from './work-items';

/**
 * WordPress autopilot, phase 4: when changes go out and how many. Pure functions (dates in, decisions
 * out) so the web app, the worker tick and the tests share them.
 */
export type AutopilotMode = 'auto' | 'approve';
export type AutopilotSettings = {
  /** The site runs by itself on working days. Off = only the "Start implementing plan" button. */
  enabled: boolean;
  /** auto: ready changes go out on schedule. approve: only changes a person approved go out. */
  mode: AutopilotMode;
  /** IANA time zone the run time is read in. */
  timezone: string;
  /** Local hour (0–23) of the daily run, Monday to Friday. */
  runHour: number;
  /** At most this many changes a day. */
  dailyCap: number;
  /** Addresses (or parts of an address, `*` as a wildcard) the autopilot never changes. */
  holdList: string[];
};

export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = { enabled: false, mode: 'auto', timezone: 'Europe/London', runHour: 9, dailyCap: 30, holdList: [] };

/** A time zone for a country (sign-up answer), falling back to London. */
export function timezoneFor(country: string | null | undefined): string {
  const c = (country ?? '').toLowerCase();
  const map: [RegExp, string][] = [
    [/united states|^us$|usa/, 'America/New_York'], [/canada/, 'America/Toronto'], [/australia/, 'Australia/Sydney'], [/new zealand/, 'Pacific/Auckland'],
    [/pakistan/, 'Asia/Karachi'], [/india/, 'Asia/Kolkata'], [/emirates|uae|dubai/, 'Asia/Dubai'], [/saudi/, 'Asia/Riyadh'], [/ireland/, 'Europe/Dublin'],
    [/germany/, 'Europe/Berlin'], [/france/, 'Europe/Paris'], [/spain/, 'Europe/Madrid'], [/italy/, 'Europe/Rome'], [/netherlands/, 'Europe/Amsterdam'],
  ];
  return map.find(([re]) => re.test(c))?.[1] ?? 'Europe/London';
}

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Date (YYYY-MM-DD), weekday (1 = Monday … 7 = Sunday) and hour in a time zone. */
export function localParts(now: Date, tz: string): { date: string; weekday: number; hour: number } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: validTimezone(tz) ? tz : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday ?? '') + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, weekday, hour: Number(p.hour) };
}

export const isWorkingDay = (weekday: number) => weekday >= 1 && weekday <= 5;

/** True when today's scheduled run should happen now (working day, at or after the run hour, not run today). */
export function runDue(s: Pick<AutopilotSettings, 'enabled' | 'timezone' | 'runHour'>, lastRunDate: string | null, now = new Date()): boolean {
  if (!s.enabled) return false;
  const l = localParts(now, s.timezone);
  return isWorkingDay(l.weekday) && l.hour >= s.runHour && lastRunDate !== l.date;
}

/** Working days (Mon–Fri) from today until `end`, today included when it is one. At least 1. */
export function workingDaysLeft(now: Date, end: Date, tz: string): number {
  let n = 0;
  for (let t = now.getTime(); t < end.getTime(); t += 86_400_000) if (isWorkingDay(localParts(new Date(t), tz).weekday)) n++;
  return Math.max(1, n);
}

/**
 * Today's share of the month's ready changes, so they are spread over the working days left in the
 * plan month instead of all going out on day one: ceil(ready ÷ days left), at least 5, at most the cap.
 */
export function todaysShare(ready: number, now: Date, monthEnd: Date, tz: string, cap: number): number {
  if (ready <= 0) return 0;
  return Math.min(cap, ready, Math.max(5, Math.ceil(ready / workingDaysLeft(now, monthEnd, tz))));
}

/** The plan month (1–6, 30 days each from the plan start) a date falls in, and when it ends. */
export function planMonthWindow(start: Date, month: number): { start: Date; end: Date } {
  const s = new Date(start.getTime() + (month - 1) * 30 * 86_400_000);
  return { start: s, end: new Date(s.getTime() + 30 * 86_400_000) };
}

/** Whether a page address is on the safety hold list. */
export function onHoldList(url: string | null, holdList: string[]): boolean {
  if (!url) return false;
  const k = pageKey(url);
  const path = `/${k.split('/').slice(1).join('/')}`.replace(/\/+$/, '') || '/';
  return holdList.some((raw) => {
    const h = raw.trim().toLowerCase();
    if (!h) return false;
    const isPath = h.startsWith('/');
    const p = isPath ? h.replace(/\/+$/, '') || '/' : pageKey(h);
    const subject = isPath ? path : k;
    if (p.includes('*')) return new RegExp(`^${p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(subject);
    return subject === p || (p !== '/' && subject.startsWith(`${p}/`));
  });
}

/** Turns each held draft into "skipped" with a reason, so it is never sent. */
export function applyHoldList(items: WorkItem[], holdList: string[]): WorkItem[] {
  return items.map((i) => (i.status === 'draft' && onHoldList(i.type === 'redirect_301' ? String((i.newValue as { from?: string })?.from ?? i.url) : i.url, holdList) ? { ...i, status: 'skipped', reason: 'On the safety hold list, so the autopilot leaves this page alone.' } : i));
}

/* ---------- results at 7, 14 and 28 days ---------- */

export const CHECKPOINTS = [7, 14, 28] as const;
/** Change types whose effect on rankings is measured (site files and redirects are checked live only). */
export const MEASURED_TYPES = ['meta_title', 'meta_description', 'heading_fix', 'content_block', 'canonical', 'internal_link', 'og_tags', 'schema'];

export type PageMetrics = { clicks: number; impressions: number; position: number | null };
export type ResultCheck = { day: number; at: string; before: PageMetrics; after: PageMetrics; verdict: 'better' | 'same' | 'worse' | 'too_little_data'; rolledBack: boolean };

/** The next checkpoint an applied change is due for (null = none due yet, or all done). */
export function dueCheckpoint(item: WorkItem & { checks?: ResultCheck[] }, now = new Date()): number | null {
  if (!item.appliedAt || !['applied', 'verified'].includes(item.status) || !MEASURED_TYPES.includes(item.type) || !item.url) return null;
  const days = (now.getTime() - new Date(item.appliedAt).getTime()) / 86_400_000;
  const done = new Set((item.checks ?? []).map((c) => c.day));
  return CHECKPOINTS.find((d) => days >= d && !done.has(d)) ?? null;
}

/**
 * Compares a page's daily average before the change with the days since. Harmful = position at
 * least 3 places lower AND clicks a day down by 30% or more, with at least 2 impressions a day before (about 50 a month).
 */
export function judgeResult(before: PageMetrics, after: PageMetrics): ResultCheck['verdict'] {
  if (before.impressions < 2 || before.position === null || after.position === null) return 'too_little_data';
  const lost = before.clicks > 0 ? (before.clicks - after.clicks) / before.clicks : 0;
  if (after.position - before.position >= 3 && lost >= 0.3) return 'worse';
  if (before.position - after.position >= 1 || (before.clicks > 0 && after.clicks / before.clicks >= 1.15)) return 'better';
  return 'same';
}

/** Daily averages (clicks and impressions a day, impression-weighted position) from Search Console page × date rows. */
export function dailyAverage(rows: { clicks: number; impressions: number; position: number }[], days: number): PageMetrics {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const pos = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : null;
  const d = Math.max(1, days);
  return { clicks: Math.round((clicks / d) * 100) / 100, impressions: Math.round((impressions / d) * 100) / 100, position: pos === null ? null : Math.round(pos * 10) / 10 };
}
