import 'server-only';
import { deliverReportEmail, emailConfig, type AuditRecord } from '@seo/core';
import { internalOrigin, renderPdf } from './pdf';

/**
 * In-process audits (no worker): email the finished report like apps/worker does.
 * The PDF is rendered from this server's own address. Never throws; problems are logged as server warnings.
 */
export async function emailReportIfRequested(record: AuditRecord): Promise<void> {
  if (record.status !== 'completed' || !record.input.notifyEmail) return;
  const mail = emailConfig(process.env, internalOrigin());
  if (!mail.ok) {
    console.warn(`[email] report ${record.id} not sent: missing ${mail.missing.join(', ')}`);
    return;
  }
  try {
    // Render from the internal address (APP_URL may be a proxy this process cannot reach).
    const renderFrom = (url: string) => renderPdf(url.replace(mail.appUrl, internalOrigin()), {}).then((b) => new Uint8Array(b));
    await deliverReportEmail(record, { ...mail, renderPdf: renderFrom });
  } catch (err) {
    console.error(`[email] report ${record.id} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
