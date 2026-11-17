import type { Metadata } from 'next';
import { MappingView } from '@/components/mapping/MappingView';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { loadCustomerSite } from '@/lib/customer-site';
import { getMapping } from '@/lib/mapping';
import { providerConfig } from '@/lib/providers-config';

export const metadata: Metadata = { title: 'Page plan' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 5 for customers: their own websites only (Page plan tab). */
export default async function CustomerPagesPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const ws = await getMapping(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="pages" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] font-bold">Your page plan</h2>
          <p className="mt-1 max-w-2xl text-[15px] text-ink-2">Which page should show up in Google for each topic, and what to change on it.</p>
        </div>
        {ws.rows.length > 0 && (
          <a href={`/api/mapping/${s.domain}/csv`} className="inline-flex min-h-10 items-center rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold hover:border-ink-3">
            Download CSV
          </a>
        )}
      </div>
      <MappingView ws={ws} pages={s.latest?.pages ?? []} audience="customer" aiAvailable={Boolean(providerConfig().env?.openai)} />
    </>
  );
}
