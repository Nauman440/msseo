import type { Logger } from 'pino';
import { sendEmail, type MonitorAlert, type MonthlyReport } from '@seo/core';
import { customerEmailsForDomain, monthlyReports, runMonitorDaily, runMonitorWeekly } from '@seo/db';

/**
 * Module 13 emails: 13.4 alerts (customer + team), 13.2 the weekly summary (customer) and 13.3 the
 * monthly report link (customer + team). Emails never fail a job; problems are logged.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const team = () => (process.env.TEAM_NOTIFY_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const app = () => (process.env.APP_URL ?? '').replace(/\/$/, '');

function layout(heading: string, paragraphs: string[], button?: { label: string; href: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:Arial,Helvetica,sans-serif;color:#0F1B2D"><div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#C2410C;font-weight:bold">MS SCORE</p>
<h1 style="margin:0 0 16px;font-size:22px">${esc(heading)}</h1>
<div style="background:#fff;border:1px solid #E7E2D8;border-radius:12px;padding:20px">${paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.6;color:#374151">${esc(p)}</p>`).join('')}
${button ? `<p style="margin:18px 0 4px"><a href="${esc(button.href)}" style="display:inline-block;background:#F97316;color:#0F1B2D;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></p>` : ''}</div>
<p style="margin:24px 0 0;font-size:12px;color:#9CA3AF">MS SCORE by Morosoft Technologies</p></div></body></html>`;
  const text = [heading, '', ...paragraphs, ...(button ? ['', `${button.label}: ${button.href}`] : []), '', 'MS SCORE by Morosoft Technologies'].join('\n');
  return { html, text };
}

async function send(to: string[], subject: string, body: { html: string; text: string }, log: Logger) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) return;
  for (const address of [...new Set(to)]) {
    await sendEmail(key, { from, to: address, subject, ...body, replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined }).catch((err: unknown) =>
      log.error({ subject, err: err instanceof Error ? err.message : String(err) }, 'monitoring email not sent'),
    );
  }
}

const link = (customer: boolean, domain: string, path: 'alerts' | 'monthly', month?: string) =>
  app()
    ? customer
      ? `${app()}/my/${path === 'alerts' ? 'alerts' : 'reports/monthly'}?site=${encodeURIComponent(domain)}${month ? `&month=${month}` : ''}`
      : `${app()}/monitor/${domain}${path === 'monthly' ? `/report?month=${month}` : ''}`
    : undefined;

function alertEmail(domain: string, alerts: MonitorAlert[], customer: boolean) {
  const worst = alerts.find((a) => a.severity === 'critical') ?? alerts[0]!;
  const subject = alerts.length === 1 ? `${domain}: ${worst.title}` : `${domain}: ${alerts.length} alerts (${worst.title})`;
  const href = link(customer, domain, 'alerts');
  return { subject, body: layout(subject, alerts.flatMap((a) => [`${a.title}. ${a.detail}`]), href ? { label: 'See alerts', href } : undefined) };
}

export async function dailyMonitoring(log: Logger): Promise<void> {
  const runs = await runMonitorDaily();
  for (const r of runs) {
    if (r.error) log.error({ domain: r.domain, err: r.error }, 'daily monitoring failed');
    if (!r.raised.length) continue;
    log.info({ domain: r.domain, alerts: r.raised.map((a) => a.kind) }, 'monitoring alerts');
    const customers = r.customer ? await customerEmailsForDomain(r.domain) : [];
    // Good news ("back up") and new reviews go to the customer; the team only hears about problems.
    const problems = r.raised.filter((a) => a.kind !== 'up' && a.severity !== 'info');
    if (customers.length) {
      const m = alertEmail(r.domain, r.raised, true);
      await send(customers, m.subject, m.body, log);
    }
    if (problems.length) {
      const m = alertEmail(r.domain, problems, false);
      await send(team(), m.subject, m.body, log);
    }
  }
  log.info({ sites: runs.length, alerts: runs.reduce((s, r) => s + r.raised.length, 0) }, 'daily monitoring finished');
}

export async function weeklyMonitoring(log: Logger): Promise<void> {
  const runs = await runMonitorWeekly();
  for (const r of runs) {
    if (r.error) {
      log.error({ domain: r.domain, err: r.error }, 'weekly monitoring failed');
      continue;
    }
    log.info({ domain: r.domain, cost: r.cost, paid: r.paidChecks }, 'weekly snapshot');
    if (!r.customer || !r.summary) continue;
    const href = link(true, r.domain, 'alerts')?.replace('/my/alerts', '/my');
    await send(await customerEmailsForDomain(r.domain), `Your week on Google: ${r.domain}`, layout(r.summary.headline, r.summary.lines, href ? { label: 'Open your dashboard', href } : undefined), log);
  }
  log.info({ sites: runs.length, cost: runs.reduce((s, r) => s + r.cost, 0) }, 'weekly monitoring finished');
}

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function monthlyLines(r: MonthlyReport): string[] {
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1));
  return [
    ...r.changes.filter((c) => c.now !== null).map((c) => `${c.label}: ${c.before !== null ? `${fmt(c.before)} → ` : ''}${fmt(c.now!)}`),
    r.winners.length ? `Moved up: ${r.winners.slice(0, 5).map((w) => w.keyword).join(', ')}.` : '',
    r.actionsDone.length ? `${r.actionsDone.length} fixes finished this month.` : '',
  ].filter(Boolean);
}

export async function monthlyReporting(log: Logger): Promise<void> {
  const reports = await monthlyReports();
  for (const { domain, customer, report } of reports) {
    const subject = `Your ${monthName(report.month)} report: ${domain}`;
    const lines = monthlyLines(report);
    if (customer) {
      const href = link(true, domain, 'monthly', report.month);
      await send(await customerEmailsForDomain(domain), subject, layout(subject, lines, href ? { label: 'Open the report', href } : undefined), log);
    }
    const href = link(false, domain, 'monthly', report.month);
    await send(team(), subject, layout(subject, lines, href ? { label: 'Open the report', href } : undefined), log);
  }
  log.info({ reports: reports.length }, 'monthly reports finished');
}
