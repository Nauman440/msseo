import type { Logger } from 'pino';
import { sendEmail } from '@seo/core';
import { firstCapNoticeThisMonth, runAutopilotFor, runDueAutopilot, type AutopilotResult } from '@seo/db';

/**
 * Autopilot (customers): the daily check runs every website due its monthly run; the
 * immediate job runs a customer's websites right after sign-up or a new website. Both stay
 * under the admin monthly cap; the team is emailed once a month when the cap stops a run.
 */
const logSite = (log: Logger) => (r: AutopilotResult) =>
  r.error
    ? log.warn({ domain: r.domain, costUsd: r.costUsd, steps: r.steps, error: r.error }, 'autopilot ran with problems')
    : log.info({ domain: r.domain, costUsd: r.costUsd, steps: r.steps }, 'autopilot ran');

export async function dailyAutopilot(log: Logger): Promise<void> {
  const r = await runDueAutopilot(new Date(), logSite(log));
  log.info({ sites: r.ran.length, spent: r.spent, cap: r.cap, capped: r.capped }, 'daily autopilot finished');
  if (r.capped) await capReached(r.spent, r.cap, log);
}

export async function customerAutopilot(userId: string, log: Logger): Promise<void> {
  const r = await runAutopilotFor(userId);
  for (const site of r.ran) logSite(log)(site);
  if (r.capped) await capReached(null, null, log);
}

async function capReached(spent: number | null, cap: number | null, log: Logger) {
  if (!(await firstCapNoticeThisMonth())) return;
  log.warn({ spent, cap }, 'autopilot paused: monthly cap reached');
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const to = (process.env.TEAM_NOTIFY_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !from || !to.length) return;
  const text =
    `Autopilot (competitors and keyword research for customers) has reached this month's spending cap${cap !== null ? ` of $${cap.toFixed(2)}` : ''}` +
    `${spent !== null ? ` (spent $${spent.toFixed(2)})` : ''}. It is paused until the 1st of next month. Manual runs still work. ` +
    'Raise the cap in Settings → Audit settings if you want it to continue.';
  for (const address of to) {
    await sendEmail(key, { from, to: address, subject: 'MSScore autopilot paused: monthly cap reached', text, html: `<p>${text}</p>` }).catch((err: unknown) =>
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'cap email failed'),
    );
  }
}
