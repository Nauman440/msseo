'use server';

import { redirect } from 'next/navigation';
import { matchGscProperties, newAuditSchema } from '@seo/core';
import { ConfigError, startAudit } from '@/lib/audit-runner';
import { availableGscProperties } from '@/lib/gsc';
import { requireUser } from '@/lib/session';

export type NewAuditState = { error?: string; fieldErrors?: Partial<Record<'url' | 'pageLimit' | 'notifyEmail' | 'gscProperty', string>> };

export async function createAuditAction(_prev: NewAuditState, form: FormData): Promise<NewAuditState> {
  const parsed = newAuditSchema.safeParse({
    url: form.get('url') ?? '',
    audience: form.get('audience') ?? 'client',
    pageLimit: form.get('pageLimit') ?? undefined,
    auditMode: form.get('mode') === 'deep' ? 'deep' : 'quick',
    jsRendering: form.get('js') === 'on',
    aiRecommendations: form.get('ai') === 'on',
    gscProperty: (form.get('gsc') as string) || null,
    gscRangeDays: form.get('gscRange') ?? undefined,
    notifyEmail: form.get('notifyEmail') ?? '',
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { url: f.url?.[0], pageLimit: f.pageLimit?.[0], notifyEmail: f.notifyEmail?.[0] } };
  }

  // The property must be one the connected account can read and must cover this domain.
  if (parsed.data.gscProperty) {
    const { properties } = await availableGscProperties();
    if (!matchGscProperties(properties, parsed.data.url).includes(parsed.data.gscProperty)) {
      return { fieldErrors: { gscProperty: 'This Search Console property is not available for this website.' } };
    }
  }

  let id: string;
  try {
    id = (await startAudit(parsed.data, (await requireUser()).id)).id;
  } catch (err) {
    if (err instanceof ConfigError) return { error: err.message };
    return { error: err instanceof Error ? err.message : 'Could not start the audit.' };
  }
  redirect(`/audits/${id}`);
}
