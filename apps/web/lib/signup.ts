import 'server-only';
import { redirect } from 'next/navigation';
import { getAccountByUserId, type Account } from './accounts';
import { getAudit } from './audit-store';
import { getSessionUser } from './session';

/** The 5 onboarding steps from design-reference/signup (step 8). */
export const STEPS = [
  { n: 1, slug: 'account', label: 'About you' },
  { n: 2, slug: 'website', label: 'Your website' },
  { n: 3, slug: 'area', label: 'Your area' },
  { n: 4, slug: 'services', label: 'Your services' },
  { n: 5, slug: 'connect', label: 'Connect and approve' },
] as const;
export const FINISHED = 6;

export const stepPath = (n: number) => (n >= FINISHED ? '/my' : `/signup/${STEPS[Math.max(0, n - 1)]!.slug}`);

export type FreeAuditSummary = { id: string; domain: string; url: string; score: number; issues: number; critical: number };

/** A completed free audit, for the sidebar and step 2 (null for anything else). */
export async function freeAuditSummary(id: string | null | undefined): Promise<FreeAuditSummary | null> {
  if (!id) return null;
  const audit = await getAudit(id).catch(() => null);
  const report = audit?.report;
  if (!audit || audit.input.source !== 'public' || audit.status !== 'completed' || !report) return null;
  const issues = (report.issues ?? []).filter((i) => i.status === 'fail' || i.status === 'warn').length;
  return { id, domain: report.project.domain, url: report.url, score: report.overall.score, issues, critical: report.severityCounts.critical };
}

/**
 * Guards onboarding steps 2–5: a signed-in customer with an account who has reached this
 * step. Earlier steps can be revisited; later ones redirect back to where they are.
 */
export async function requireOnboardingStep(n: number): Promise<{ account: Account; name: string }> {
  const user = await getSessionUser();
  if (!user?.id) redirect(`/login?next=${encodeURIComponent(stepPath(n))}`);
  if (user.role !== 'customer') redirect('/dashboard');
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  if (account.onboardingStep >= FINISHED) redirect('/my');
  if (n > account.onboardingStep) redirect(stepPath(account.onboardingStep));
  return { account, name: user.name };
}

/**
 * A website's address as entered, without query or #part, or null. Kept with its folder: a website that
 * lives in a folder (example.com/srm/) is audited from there, because the domain root may not be it.
 */
export function websiteAddress(input: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    if (!url.hostname.includes('.')) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return null;
  }
}
