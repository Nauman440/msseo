import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/forms/ActionForm';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { domainOf, listAccounts, PLANS, type AccountWithUser } from '@/lib/accounts';
import { requireUser } from '@/lib/session';
import { cn } from '@/lib/tones';
import { updateCustomerAction } from '../actions';

export const metadata: Metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

const CONNECTION_LABEL: Record<string, string> = { gsc: 'Search Console', ga4: 'Google Analytics', gbp: 'Business Profile', cms: 'Website admin' };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–');

function statusOf(a: AccountWithUser): { label: string; tone: string } {
  if (a.status === 'cancelled') return { label: 'Cancelled', tone: 'bg-info-bg text-info-text' };
  if (a.status === 'active') return { label: 'Active', tone: 'bg-pass-bg text-pass-text' };
  if (Date.parse(a.trialEndsAt) < Date.now()) return { label: 'Trial ended', tone: 'bg-fail-bg text-fail-text' };
  return { label: 'Trial', tone: 'bg-primary-soft text-primary-text' };
}

const Row = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[130px_1fr] gap-3 py-1.5 text-sm">
    <dt className="text-ink-3">{term}</dt>
    <dd className="min-w-0 break-words text-ink">{children}</dd>
  </div>
);

/** Team view of everyone who signed up through the public funnel (step 8). */
export default async function CustomersPage() {
  const user = await requireUser();
  const accounts = await listAccounts();
  const isAdmin = user.role === 'admin';

  return (
    <Container className="flex flex-col gap-8 py-12">
      <SectionHeader as="h1" align="left" eyebrow="Customers" title="Trials and plans" intro="Everyone who signed up from the website, with what they told us during onboarding. No payment is taken in the app: confirm the plan with the customer, then mark it active." />

      {accounts.length === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-2">No sign-ups yet. They appear here as soon as someone finishes step 1.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {accounts.map((a) => {
            const s = statusOf(a);
            return (
              <li key={a.id} className="rounded-panel border border-border bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold">{a.businessName}</h2>
                    <p className="text-sm text-ink-2">
                      {a.name ?? '–'} · <a href={`mailto:${a.email}`} className="text-primary-text hover:underline">{a.email}</a>
                      {a.phone && <> · <a href={`tel:${a.phone}`} className="text-primary-text hover:underline">{a.phone}</a></>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-pill bg-sunken px-2.5 py-1 text-xs font-bold">{PLANS[a.plan].name} · {PLANS[a.plan].price}{PLANS[a.plan].unit}</span>
                    <span className={cn('rounded-pill px-2.5 py-1 text-xs font-bold', s.tone)}>{s.label}</span>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-x-8 md:grid-cols-2">
                  <div>
                    <Row term="Website">
                      {a.website ? (
                        a.projectId ? <Link href={`/projects/${a.projectId}`} className="text-primary-text hover:underline">{domainOf(a.website)}</Link> : domainOf(a.website)
                      ) : '–'}
                      {a.extraWebsites.length > 0 && <span className="text-ink-2"> + {a.extraWebsites.map(domainOf).join(', ')}</span>}
                    </Row>
                    <Row term="Signed up">{day(a.createdAt)}</Row>
                    <Row term="Trial ends">{day(a.trialEndsAt)}</Row>
                    <Row term="Onboarding">{a.onboardedAt ? `Finished ${day(a.onboardedAt)}` : `Stopped at step ${a.onboardingStep} of 5`}</Row>
                    <Row term="Last auto-audit">{day(a.lastAutoAuditAt)}</Row>
                  </div>
                  <div>
                    <Row term="Area">{[a.country, ...a.areas].filter(Boolean).join(', ') || '–'}{a.otherCountries ? ' (+ other countries)' : ''}</Row>
                    <Row term="Language">{a.language ?? '–'}</Row>
                    <Row term="Services">{a.services.join(', ') || '–'}</Row>
                    <Row term="Competitors">{a.competitors.join(', ') || '–'}</Row>
                    <Row term="Can connect">{a.connections.map((c) => CONNECTION_LABEL[c] ?? c).join(', ') || 'Nothing yet'}</Row>
                    <Row term="Changes">{a.consentChanges ? `Allowed to prepare changes (${day(a.consentAt)})` : 'Not yet allowed'}</Row>
                  </div>
                </dl>

                {isAdmin && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    {a.status !== 'active' && (
                      <ActionForm action={updateCustomerAction} submit="Mark active" tone="secondary">
                        <input type="hidden" name="userId" value={a.userId} />
                        <input type="hidden" name="op" value="active" />
                      </ActionForm>
                    )}
                    <ActionForm action={updateCustomerAction} submit="Extend trial 7 days" tone="secondary">
                      <input type="hidden" name="userId" value={a.userId} />
                      <input type="hidden" name="op" value="extend" />
                    </ActionForm>
                    {a.status !== 'cancelled' && (
                      <ActionForm action={updateCustomerAction} submit="Cancel" tone="secondary">
                        <input type="hidden" name="userId" value={a.userId} />
                        <input type="hidden" name="op" value="cancelled" />
                      </ActionForm>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
