import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CompetitorWorkspaceView } from '@/components/competitors/CompetitorWorkspaceView';
import { accountSites, domainOf, getAccountByUserId } from '@/lib/accounts';
import { getWorkspace } from '@/lib/competitors';
import { requireCustomer } from '@/lib/session';
import { FINISHED, stepPath } from '@/lib/signup';
import { cn } from '@/lib/tones';

export const metadata: Metadata = { title: 'Your competitors' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ site?: string }> };

/** Module 3 for customers: their own websites only. */
export default async function CustomerCompetitorsPage({ searchParams }: Props) {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  if (account.onboardingStep < FINISHED) redirect(stepPath(account.onboardingStep));
  const sites = accountSites(account);
  const { site } = await searchParams;
  const current = sites.find((w) => domainOf(w) === site) ?? sites[0];
  if (!current) redirect('/my');
  const ws = await getWorkspace(domainOf(current));

  return (
    <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-10 sm:px-6">
      <div>
        <p className="text-[13px] font-medium text-ink-3">
          <Link href="/my" className="hover:text-ink">Your dashboard</Link>
        </p>
        <h1 className="mt-2 font-display text-[30px] font-bold tracking-display sm:text-[36px]">Your competitors</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-ink-2">Who shows up in Google when your customers search, how strong they are, and which directories you should be listed on.</p>
      </div>
      {sites.length > 1 && (
        <nav aria-label="Your websites" className="flex flex-wrap gap-2">
          {sites.map((w) => {
            const d = domainOf(w);
            return (
              <Link key={d} href={`/my/competitors?site=${encodeURIComponent(d)}`} aria-current={w === current ? 'page' : undefined} className={cn('inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold', w === current ? 'border-night bg-night text-mist' : 'border-border-strong hover:border-ink-3')}>
                {d}
              </Link>
            );
          })}
        </nav>
      )}
      <CompetitorWorkspaceView ws={ws} audience="customer" />
    </div>
  );
}
