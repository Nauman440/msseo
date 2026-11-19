import type { Metadata } from 'next';
import { ContentView } from '@/components/content/ContentView';
import { SiteHeader } from '@/components/customer/SiteHeader';
import { getContent } from '@/lib/content';
import { loadCustomerSite } from '@/lib/customer-site';

export const metadata: Metadata = { title: 'Content' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 7 for customers: their own websites only (Content tab). */
export default async function CustomerContentPage({ searchParams }: Props) {
  const { site } = await searchParams;
  const s = await loadCustomerSite(site);
  const audit = await getContent(s.domain);
  return (
    <>
      <SiteHeader domain={s.domain} tab="content" connected={s.connected} latestId={s.latestId} pages={s.latest?.pagesCrawled ?? null} running={s.running} multiSite={s.sites.length > 1} autopilotAt={s.autopilotAt} />
      <ContentView audit={audit} domain={s.domain} audience="customer" />
    </>
  );
}
