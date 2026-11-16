import { request, type HttpLog } from './http';

/**
 * Resend (resend.com/docs/api-reference/emails/send-email, confirmed 2026-11-16):
 * POST https://api.resend.com/emails, Bearer key, a User-Agent is required (403 without),
 * attachments as base64 `content` + `filename`, ≤ 40 MB per email, Idempotency-Key ≤ 256 chars.
 */
export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Uint8Array }[];
  idempotencyKey?: string;
};

const base64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function sendEmail(apiKey: string, m: EmailMessage, log?: HttpLog): Promise<{ id: string }> {
  const res = await request('https://api.resend.com/emails', {
    provider: 'resend',
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'user-agent': 'MSScore/1.0 (+https://msseo.tech)',
      ...(m.idempotencyKey ? { 'idempotency-key': m.idempotencyKey.slice(0, 256) } : {}),
    },
    body: {
      from: m.from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: base64(a.content) })) } : {}),
    },
    timeoutMs: 30_000,
    retries: 1,
    log,
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok || !json.id) throw new Error(`Resend ${res.status}: ${json.message ?? json.name ?? 'email not accepted'}`);
  return { id: json.id };
}
