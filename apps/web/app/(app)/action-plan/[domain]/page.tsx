import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normDomain, suggestions } from '@seo/core';
import { ActionPlanView } from '@/components/actions/ActionPlanView';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { SiteConnectionCard } from '@/components/connections/SiteConnectionCard';
import { getActions, planContext } from '@/lib/actions';
import { connectionsReady, getConnection, shopifyApp, viewOf } from '@/lib/connections';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<{ error?: string; connected?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Action plan · ${normDomain(decodeURIComponent((await params).domain))}` };
}

/** Module 12 for the team: any client's website. */
export default async function TeamActionPlanPage({ params, searchParams }: Props) {
  await requireUser();
  const domain = normDomain(decodeURIComponent((await params).domain));
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) notFound();
  const [ws, ctx, conn, q] = await Promise.all([getActions(domain), planContext(domain), getConnection(domain), searchParams]);
  const link = 'inline-flex min-h-11 items-center rounded-button border border-border-strong bg-surface px-5 text-sm font-semibold hover:border-ink-3';
  return (
    <Container className="flex flex-col gap-8 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader as="h1" align="left" eyebrow="Action plan" title={domain} intro="Every finding turned into tracked work: priority (impact × confidence ÷ effort), owner, due date, approval, and results checked 7, 14 and 28 days after each fix." />
        <div className="flex flex-wrap gap-3">
          <Link href={`/keywords/${domain}?view=mapping`} className={link}>Page mapping</Link>
          {ws.actions.length > 0 && <a href={`/api/action-plan/${domain}/csv`} className={link}>Download CSV</a>}
        </div>
      </div>
      {q.error && <p role="alert" className="rounded-[14px] border border-fail-bg bg-surface p-4 text-sm font-semibold text-fail-text">{q.error}</p>}
      {q.connected && <p role="status" className="rounded-[14px] border border-border bg-surface p-4 text-sm font-semibold text-pass-text">{q.connected === 'shopify' ? 'Shopify' : 'WordPress'} is connected.</p>}
      <ActionPlanView ws={ws} open={suggestions(ws, ctx.report, ctx.mapping)} audience="team" hasAudit={Boolean(ctx.report)} site={viewOf(conn)} connectHref="#site-connection" />
      <SiteConnectionCard domain={domain} connection={viewOf(conn)} back={`/action-plan/${domain}`} ready={connectionsReady()} shopifyReady={Boolean(shopifyApp())} audience="team" />
    </Container>
  );
}
