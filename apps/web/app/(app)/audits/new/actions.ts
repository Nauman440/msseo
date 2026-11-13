'use server';

import { redirect } from 'next/navigation';
import { newAuditSchema } from '@seo/core';
import { ConfigError, startAudit } from '@/lib/audit-runner';

export type NewAuditState = { error?: string; fieldErrors?: Partial<Record<'url' | 'pageLimit' | 'notifyEmail', string>> };

export async function createAuditAction(_prev: NewAuditState, form: FormData): Promise<NewAuditState> {
  const parsed = newAuditSchema.safeParse({
    url: form.get('url') ?? '',
    audience: form.get('audience') ?? 'client',
    pageLimit: form.get('pageLimit') ?? undefined,
    jsRendering: form.get('js') === 'on',
    aiRecommendations: form.get('ai') === 'on',
    gscProperty: (form.get('gsc') as string) || null,
    notifyEmail: form.get('notifyEmail') ?? '',
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { url: f.url?.[0], pageLimit: f.pageLimit?.[0], notifyEmail: f.notifyEmail?.[0] } };
  }

  let id: string;
  try {
    id = (await startAudit(parsed.data)).id;
  } catch (err) {
    if (err instanceof ConfigError) return { error: err.message };
    return { error: err instanceof Error ? err.message : 'Could not start the audit.' };
  }
  redirect(`/audits/${id}`);
}
