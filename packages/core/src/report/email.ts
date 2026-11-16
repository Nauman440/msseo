import type { AuditRecord } from '../audit/execute';
import type { HttpLog } from '../providers/http';
import { sendEmail } from '../providers/resend';
import type { ReportModel } from '../types';
import { signPrintToken } from './print-token';

/**
 * "Email me the full report" (spec §5.1 4a): after an audit completes (including AI
 * recommendations), render its PDF and send it to `input.notifyEmail` via Resend.
 * The PDF renderer is passed in because Playwright lives in the apps, not in core.
 */
export type EmailEnv = {
  resendApiKey: string;
  from: string;
  /** Public address of the web app the PDF is rendered from, e.g. https://msseo.tech. */
  appUrl: string;
  /** Shared with the web app; signs the print-page token. */
  encryptionKey: string;
  renderPdf: (url: string) => Promise<Uint8Array>;
  log?: HttpLog;
};

/** Email settings from the environment; null (with what is missing) when email cannot be sent. */
export function emailConfig(env: NodeJS.ProcessEnv = process.env, appUrlFallback?: string): { ok: true; resendApiKey: string; from: string; appUrl: string; encryptionKey: string } | { ok: false; missing: string[] } {
  const resendApiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const appUrl = (env.APP_URL?.trim() || appUrlFallback || '').replace(/\/$/, '');
  const encryptionKey = env.ENCRYPTION_KEY?.trim();
  const missing = [!resendApiKey && 'RESEND_API_KEY', !from && 'EMAIL_FROM', !appUrl && 'APP_URL', !encryptionKey && 'ENCRYPTION_KEY'].filter((x): x is string => Boolean(x));
  return missing.length ? { ok: false, missing } : { ok: true, resendApiKey: resendApiKey!, from: from!, appUrl, encryptionKey: encryptionKey! };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function reportEmail(report: ReportModel, mode: 'client' | 'expert', reportUrl: string): { subject: string; html: string; text: string } {
  const domain = report.project.domain;
  const top = report.topIssues.slice(0, 3).map((t) => t.title[mode]);
  const subject = `SEO audit for ${domain}: ${report.overall.score}/100 (${report.overall.label})`;
  const text = [
    `Your SEO audit for ${domain} is ready.`,
    '',
    `Health score: ${report.overall.score}/100 (${report.overall.label}). After fixing the critical and high issues: ${report.overall.afterFixes}.`,
    ...(top.length ? ['', 'Fix first:', ...top.map((t, i) => `${i + 1}. ${t}`)] : []),
    '',
    'The full report is attached as a PDF.',
    `Team members can also open it online: ${reportUrl}`,
    '',
    'MS SCORE by Morosoft Technologies',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:Arial,Helvetica,sans-serif;color:#0F1B2D">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#C2410C;font-weight:bold">SEO audit report</p>
  <h1 style="margin:0 0 16px;font-size:24px">${esc(domain)}</h1>
  <div style="background:#fff;border:1px solid #E7E2D8;border-radius:12px;padding:20px">
    <p style="margin:0;font-size:40px;font-weight:bold">${report.overall.score}<span style="font-size:18px;color:#6B7280">/100</span></p>
    <p style="margin:4px 0 0;color:#4B5563">${esc(report.overall.label)} · after fixing critical and high issues: <strong>${report.overall.afterFixes}</strong></p>
    ${top.length ? `<p style="margin:18px 0 6px;font-weight:bold">Fix first</p><ol style="margin:0;padding-left:20px;color:#374151">${top.map((t) => `<li style="margin:4px 0">${esc(t)}</li>`).join('')}</ol>` : ''}
  </div>
  <p style="margin:20px 0 0;color:#374151">The full report is attached as a PDF.</p>
  <p style="margin:8px 0 0;font-size:13px;color:#6B7280">Team members can also <a href="${esc(reportUrl)}" style="color:#C2410C">open it online</a>.</p>
  <p style="margin:28px 0 0;font-size:12px;color:#9CA3AF">MS SCORE by Morosoft Technologies</p>
</div></body></html>`;
  return { subject, html, text };
}

/** Renders the report PDF and emails it. Throws with a readable message on failure. */
export async function deliverReportEmail(record: AuditRecord, env: EmailEnv): Promise<{ id: string }> {
  const report = record.report;
  const to = record.input.notifyEmail;
  if (!report || record.status !== 'completed' || !to) throw new Error('Nothing to send');
  const mode = record.input.audience;
  const token = await signPrintToken(record.id, env.encryptionKey);
  const printUrl = `${env.appUrl}/audits/${encodeURIComponent(record.id)}/print?mode=${mode}&pdf_token=${encodeURIComponent(token)}`;
  const pdf = await env.renderPdf(printUrl);
  const { subject, html, text } = reportEmail(report, mode, `${env.appUrl}/audits/${record.id}?mode=${mode}`);
  const domain = report.project.domain.replace(/[^a-z0-9.-]/gi, '');
  return sendEmail(
    env.resendApiKey,
    {
      from: env.from,
      to,
      subject,
      html,
      text,
      attachments: [{ filename: `seo-audit-${domain}-${report.crawledAt.slice(0, 10)}-${mode}.pdf`, content: pdf }],
      // One email per run of this audit, even if the job is retried.
      idempotencyKey: `report-${record.id}-${record.createdAt}`,
    },
    env.log,
  );
}
