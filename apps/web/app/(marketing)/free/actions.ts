'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { newAuditSchema } from '@seo/core';
import { ConfigError, startAudit } from '@/lib/audit-runner';
import { countPublicAuditsSince } from '@/lib/audit-store';
import { hit } from '@/lib/rate-limit';
import { appSettings } from '@/lib/settings';
import { clientIp, verifyTurnstile } from '@/lib/turnstile';

export type FreeAuditState = { error?: string; fieldErrors?: { url?: string; email?: string } };

/** Free audits per visitor per day (step 8 decision). */
const PER_VISITOR = 3;

/**
 * Public free audit (step 8): Turnstile, on/off switch, daily cap and a per-visitor limit,
 * then a quick 10-page client audit with no AI and no Search Console.
 */
export async function startFreeAuditAction(_prev: FreeAuditState, form: FormData): Promise<FreeAuditState> {
  const parsed = newAuditSchema.safeParse({
    url: form.get('url') ?? '',
    notifyEmail: form.get('email') ?? '',
    audience: 'client',
    pageLimit: 10,
    auditMode: 'quick',
    jsRendering: false,
    aiRecommendations: false,
    gscProperty: null,
    source: 'public',
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { url: f.url?.[0], email: f.notifyEmail?.[0] } };
  }

  const settings = await appSettings();
  if (!settings['public.enabled']) return { error: 'Free audits are paused at the moment. Please try again later.' };

  const h = await headers();
  const ip = clientIp(h);
  const human = await verifyTurnstile(form.get('cf-turnstile-response') as string | null, ip);
  if (!human.ok) {
    return { error: human.reason === 'not-configured' ? 'Free audits are not switched on yet. Please try again later.' : 'Please complete the "I am human" check and try again.' };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if ((await countPublicAuditsSince(today)) >= settings['public.dailyCap']) {
    return { error: 'We have reached today’s limit for free audits. Please come back tomorrow.' };
  }
  if (!(await hit(`free-audit:${ip ?? 'unknown'}`, PER_VISITOR, 24 * 60 * 60)).allowed) {
    return { error: `You can run ${PER_VISITOR} free audits a day. Start a free trial for unlimited audits, or come back tomorrow.` };
  }

  let id: string;
  try {
    id = (await startAudit(parsed.data, null)).id;
  } catch (err) {
    return { error: err instanceof ConfigError ? 'Free audits are not available right now.' : 'Could not start the audit. Please try again.' };
  }
  redirect(`/free/${id}`);
}
