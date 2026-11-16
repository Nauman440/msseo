import 'server-only';
import { sendEmail } from '@seo/core';

/**
 * Account emails (welcome, password reset, team alerts) via Resend. Needs RESEND_API_KEY
 * and EMAIL_FROM (a verified domain, e.g. reports@msseo.tech); EMAIL_REPLY_TO sends
 * replies to the team inbox. Returns false (and logs) instead of throwing.
 */
export const mailReady = () => Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Paragraphs + optional button, in the same look as the report email. */
export function emailLayout(o: { heading: string; paragraphs: string[]; button?: { label: string; href: string }; footer?: string }): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:Arial,Helvetica,sans-serif;color:#0F1B2D">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#C2410C;font-weight:bold">MS SCORE</p>
  <h1 style="margin:0 0 16px;font-size:22px">${esc(o.heading)}</h1>
  <div style="background:#fff;border:1px solid #E7E2D8;border-radius:12px;padding:20px">
    ${o.paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.6;color:#374151">${esc(p)}</p>`).join('')}
    ${o.button ? `<p style="margin:18px 0 4px"><a href="${esc(o.button.href)}" style="display:inline-block;background:#F97316;color:#0F1B2D;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:10px">${esc(o.button.label)}</a></p>` : ''}
  </div>
  <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF">${esc(o.footer ?? 'MS SCORE by Morosoft Technologies')}</p>
</div></body></html>`;
  const text = [o.heading, '', ...o.paragraphs, ...(o.button ? ['', `${o.button.label}: ${o.button.href}`] : []), '', o.footer ?? 'MS SCORE by Morosoft Technologies'].join('\n');
  return { html, text };
}

export async function sendMail(to: string, subject: string, body: { html: string; text: string }): Promise<boolean> {
  if (!mailReady()) {
    console.warn(`[email] "${subject}" not sent: RESEND_API_KEY / EMAIL_FROM missing`);
    return false;
  }
  try {
    await sendEmail(process.env.RESEND_API_KEY!.trim(), { from: process.env.EMAIL_FROM!.trim(), to, subject, ...body, replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined });
    return true;
  } catch (err) {
    console.error(`[email] "${subject}" failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** New-signup alerts for the team (TEAM_NOTIFY_EMAIL, comma-separated). */
export async function notifyTeam(subject: string, body: { html: string; text: string }): Promise<void> {
  const to = (process.env.TEAM_NOTIFY_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  await Promise.all(to.map((t) => sendMail(t, subject, body)));
}
