import 'server-only';
import { newAuditSchema } from '@seo/core';
import { domainOf, getAccountByUserId, PLANS, updateAccount } from './accounts';
import { startAudit } from './audit-runner';
import { startAutopilot } from './autopilot';
import { emailLayout, notifyTeam } from './mailer';
import { FINISHED, freeAuditSummary } from './signup';

/**
 * The end of sign-up (after step 5, and after Stripe Checkout when billing is on): marks
 * onboarding finished, tells the team, starts a first audit of their website when the free
 * audit was of another site, and starts autopilot. Safe to call twice: it does nothing once finished.
 */
export async function completeOnboarding(user: { id: string; name: string; email: string | null }): Promise<void> {
  const account = await getAccountByUserId(user.id);
  if (!account || account.onboardingStep >= FINISHED) return;
  await updateAccount(user.id, { onboardingStep: FINISHED, onboardedAt: new Date().toISOString() });

  const free = await freeAuditSummary(account.sourceAuditId);
  const answers = [
    `Business: ${account.businessName} (${user.name}, ${user.email ?? ''}${account.phone ? `, ${account.phone}` : ''})`,
    `Plan: ${PLANS[account.plan].name}, trial until ${account.trialEndsAt.slice(0, 10)}${account.stripeSubscriptionId ? ` (Stripe ${account.billingStatus ?? ''}, card on file)` : ''}`,
    `Website: ${account.website ?? '-'}`,
    `Area: ${[account.country, ...account.areas].filter(Boolean).join(', ') || '-'}${account.otherCountries ? ' (+ other countries)' : ''}, language ${account.language ?? '-'}`,
    `Services: ${account.services.join(', ') || '-'}; competitors: ${account.competitors.join(', ') || '-'}`,
    `Keywords they want: ${(account.keywords ?? []).join(', ') || '-'}`,
    `Can connect: ${account.connections.join(', ') || 'nothing yet'}; may prepare changes: ${account.consentChanges ? 'yes' : 'no'}`,
  ];
  const base = (process.env.APP_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim() || '').replace(/\/$/, '');
  await notifyTeam(
    `New trial: ${account.businessName} (${PLANS[account.plan].name})`,
    emailLayout({ heading: 'A new customer finished sign-up', paragraphs: answers, button: base ? { label: 'Open Customers', href: `${base}/settings/customers` } : undefined }),
  );
  if (account.website && (!free || free.domain !== domainOf(account.website))) {
    const input = newAuditSchema.parse({ url: account.website, audience: 'client', pageLimit: 10, auditMode: 'quick', jsRendering: false, source: 'customer' });
    await startAudit(input, user.id).catch(() => undefined); // the dashboard offers "Run audit" if this fails
  }
  // Autopilot: competitors, keywords and the page plan fill in by themselves a few minutes later.
  await startAutopilot(user.id);
}
