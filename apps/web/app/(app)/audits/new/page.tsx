import type { Metadata } from 'next';
import { parseMode } from '@/lib/reports';
import { providerConfig } from '@/lib/providers-config';
import { NewAuditForm } from '@/components/forms/NewAuditForm';

export const metadata: Metadata = { title: 'New audit' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ url?: string; audience?: string }> };

export default async function NewAuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const { status } = providerConfig();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">New audit</p>
      <h1 className="mt-2 font-display text-[32px] font-bold tracking-display">Audit a website</h1>
      <p className="mt-2 text-[15px] text-ink-2">Technical (Module 1) and on-page (Module 2) checks.</p>
      <NewAuditForm
        defaultUrl={params.url ?? ''}
        audience={parseMode(params.audience, 'client')}
        ready={status.dataforseo}
        pagespeedReady={status.pagespeed}
        emailReady={status.email}
        aiReady={status.openai}
      />
    </div>
  );
}
