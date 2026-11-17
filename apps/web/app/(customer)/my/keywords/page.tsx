import type { Metadata } from 'next';
import { KeywordWorkspaceView } from '@/components/keywords/KeywordWorkspaceView';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { loadCustomerSite } from '@/lib/customer-site';
import { getKeywordWorkspace } from '@/lib/keywords';

export const metadata: Metadata = { title: 'Your keywords' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 4 for customers: their own websites only (Keywords tab). */
export default async function CustomerKeywordsPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const ws = await getKeywordWorkspace(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="keywords" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <div>
        <h2 className="font-display text-[24px] font-bold">Your keywords</h2>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-2">What your customers type into Google, grouped into topics, with the ones worth going after first.</p>
      </div>
      <KeywordWorkspaceView ws={ws} audience="customer" />
    </>
  );
}
