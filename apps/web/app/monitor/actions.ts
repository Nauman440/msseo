'use server';

import { revalidatePath } from 'next/cache';
import { normDomain, type MeetingCadence } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { runMonitorNow, setMeeting, updateMonitor } from '@/lib/monitor';

/** Module 13 actions. Settings and "Run checks now" are the team's; anyone with access can close an alert. */
export type MonitorState = { error?: string; ok?: string };
const CADENCES: MeetingCadence[] = ['none', 'weekly', 'fortnightly', 'monthly'];

async function guard(rawDomain: string, teamOnly: boolean) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer || (teamOnly && viewer.kind === 'customer')) throw new Error('Not allowed');
  return domain;
}
const paths = (domain: string) => {
  revalidatePath(`/monitor/${domain}`);
  revalidatePath('/my/monitor');
  revalidatePath('/my/alerts');
};

export async function runMonitorAction(rawDomain: string): Promise<MonitorState> {
  const domain = await guard(rawDomain, true);
  try {
    const r = await runMonitorNow(domain);
    paths(domain);
    return { ok: `Checked${r.cost ? ` ($${r.cost.toFixed(3)})` : ''}. ${r.alerts ? `${r.alerts} new ${r.alerts === 1 ? 'alert' : 'alerts'}.` : 'No new alerts.'}` };
  } catch (err) {
    return { error: `The checks did not finish: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown error'}` };
  }
}

export async function setMonitoringAction(rawDomain: string, on: boolean): Promise<MonitorState> {
  const domain = await guard(rawDomain, true);
  await updateMonitor(domain, (ws) => void (ws.enabled = on));
  paths(domain);
  return { ok: on ? 'Monitoring is on: checked every day, snapshot every Monday.' : 'Monitoring is off.' };
}

/** 13.5 The tracked keywords: one per line (empty = back to the site's top topics). */
export async function saveKeywordsAction(rawDomain: string, _prev: MonitorState, form: FormData): Promise<MonitorState> {
  const domain = await guard(rawDomain, true);
  const list = [...new Set(String(form.get('keywords') ?? '').split(/\r?\n/).map((k) => k.trim().toLowerCase()).filter((k) => k.length > 1 && k.length <= 80))];
  if (list.length > 20) return { error: 'Track up to 20 searches.' };
  await updateMonitor(domain, (ws) => {
    ws.ranks.custom = list.length > 0;
    ws.ranks.keywords = list;
  });
  paths(domain);
  return { ok: list.length ? `Tracking ${list.length} searches.` : 'Back to the top topics from Keywords.' };
}

/** 13.8 Review meeting schedule. */
export async function saveMeetingAction(rawDomain: string, _prev: MonitorState, form: FormData): Promise<MonitorState> {
  const domain = await guard(rawDomain, true);
  const cadence = CADENCES.find((c) => c === form.get('cadence')) ?? 'none';
  const next = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('next'))) ? String(form.get('next')) : null;
  await updateMonitor(domain, (ws) => setMeeting(ws, cadence, next, String(form.get('notes') ?? '')));
  paths(domain);
  return { ok: 'Saved.' };
}

export async function resolveAlertAction(rawDomain: string, id: string): Promise<MonitorState> {
  const domain = await guard(rawDomain, false);
  await updateMonitor(domain, (ws) => {
    const a = ws.alerts.find((x) => x.id === id);
    if (a && !a.resolvedAt) a.resolvedAt = new Date().toISOString();
  });
  paths(domain);
  return { ok: 'Closed.' };
}
