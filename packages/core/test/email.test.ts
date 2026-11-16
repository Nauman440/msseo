import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverReportEmail, emailConfig, newAuditRecord, newAuditSchema, reportEmail, sampleReport } from '../src';
import { signPrintToken, verifyPrintToken } from '../src/report/print-token';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('print token', () => {
  it('accepts its own audit before expiry only', async () => {
    const t = await signPrintToken('audit-1', KEY, 600, 1_000_000);
    expect(await verifyPrintToken(t, 'audit-1', KEY, 1_000_000)).toBe(true);
    expect(await verifyPrintToken(t, 'audit-2', KEY, 1_000_000)).toBe(false);
    expect(await verifyPrintToken(t, 'audit-1', KEY, 1_000_000 + 601_000)).toBe(false);
    expect(await verifyPrintToken(t, 'audit-1', Buffer.alloc(32, 8).toString('base64'), 1_000_000)).toBe(false);
    expect(await verifyPrintToken(`${t}x`, 'audit-1', KEY, 1_000_000)).toBe(false);
    expect(await verifyPrintToken('garbage', 'audit-1', KEY, 1_000_000)).toBe(false);
  });
});

describe('report email', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists what is missing', () => {
    expect(emailConfig({ RESEND_API_KEY: 'k' } as NodeJS.ProcessEnv)).toEqual({ ok: false, missing: ['EMAIL_FROM', 'APP_URL', 'ENCRYPTION_KEY'] });
  });

  it('escapes the domain and issue titles in HTML', () => {
    const r = { ...sampleReport, project: { name: 'x', domain: '<b>evil</b>.com' } };
    const { html, subject } = reportEmail(r, 'client', 'https://msseo.tech/audits/1');
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;.com');
    expect(html).not.toContain('<b>evil</b>');
    expect(subject).toContain(`${sampleReport.overall.score}/100`);
  });

  it('renders the PDF through a signed print link and sends it with Resend', async () => {
    const record = newAuditRecord(newAuditSchema.parse({ url: 'https://www.summitairhvac.com/', notifyEmail: 'team@example.com', audience: 'expert' }));
    Object.assign(record, { status: 'completed', report: sampleReport });
    const rendered: string[] = [];
    let sent: { headers: Record<string, string>; body: { to: string[]; attachments: { filename: string; content: string }[] } } | undefined;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.resend.com/emails');
      sent = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return Response.json({ id: 'email-1' });
    });
    const res = await deliverReportEmail(record, {
      resendApiKey: 're_test', from: 'MS SCORE <reports@msseo.tech>', appUrl: 'https://msseo.tech', encryptionKey: KEY,
      renderPdf: async (url) => {
        rendered.push(url);
        return new Uint8Array([37, 80, 68, 70]); // "%PDF"
      },
    });
    expect(res.id).toBe('email-1');
    const printUrl = new URL(rendered[0]!);
    expect(printUrl.pathname).toBe(`/audits/${record.id}/print`);
    expect(printUrl.searchParams.get('mode')).toBe('expert');
    expect(await verifyPrintToken(printUrl.searchParams.get('pdf_token')!, record.id, KEY)).toBe(true);
    expect(sent!.headers.authorization).toBe('Bearer re_test');
    expect(sent!.headers['user-agent']).toMatch(/MSScore/);
    expect(sent!.headers['idempotency-key']).toBe(`report-${record.id}-${record.createdAt}`);
    expect(sent!.body.to).toEqual(['team@example.com']);
    expect(sent!.body.attachments[0]).toEqual({ filename: expect.stringMatching(/^seo-audit-summitairhvac\.com-.*-expert\.pdf$/), content: 'JVBERg==' });
  });

  it('reports a Resend rejection clearly', async () => {
    const record = newAuditRecord(newAuditSchema.parse({ url: 'https://example.com/', notifyEmail: 'a@example.com' }));
    Object.assign(record, { status: 'completed', report: sampleReport });
    vi.stubGlobal('fetch', async () => Response.json({ name: 'validation_error', message: 'The from address domain is not verified.' }, { status: 403 }));
    await expect(
      deliverReportEmail(record, { resendApiKey: 'k', from: 'x@y.z', appUrl: 'https://a.b', encryptionKey: KEY, renderPdf: async () => new Uint8Array(1) }),
    ).rejects.toThrow('Resend 403: The from address domain is not verified.');
  });
});
