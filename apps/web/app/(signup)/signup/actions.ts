'use server';

import { AuthError, CredentialsSignin } from 'next-auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { newAuditSchema } from '@seo/core';
import { CONNECTIONS, createAccount, domainOf, getAccountByUserId, isPlan, PLANS, TRIAL_DAYS, updateAccount, type Connection } from '@/lib/accounts';
import { startAudit } from '@/lib/audit-runner';
import { signIn } from '@/lib/auth';
import { authEnabled, getSessionUser } from '@/lib/session';
import { FINISHED, freeAuditSummary, stepPath, websiteOrigin } from '@/lib/signup';
import { startAutopilot } from '@/lib/autopilot';
import { emailLayout, notifyTeam, sendMail } from '@/lib/mailer';
import { createUser, UserExistsError } from '@/lib/users';

/** Step 8 signup: one action per onboarding step. Errors come back to the form. */
export type SignupState = { error?: string };

const first = (e: z.ZodError) => e.issues[0]?.message ?? 'Please check the form.';
const list = (form: FormData, name: string) =>
  [...new Set(form.getAll(name).map((v) => String(v).trim()).filter(Boolean))].slice(0, 50).map((v) => v.slice(0, 120));

async function currentCustomer() {
  const user = await getSessionUser();
  if (!user?.id || user.role !== 'customer') redirect('/signup');
  const account = await getAccountByUserId(user.id);
  if (!account) redirect('/signup');
  return { user, account };
}

const aboutYou = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  businessName: z.string().trim().min(1, 'Enter your business name').max(120),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

/** Step 1: create the customer login + account (7-day trial), then sign in. */
export async function createAccountAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  if (!authEnabled()) return { error: 'Sign-up is not available on this server yet.' };
  const plan = form.get('plan');
  if (!isPlan(plan)) return { error: 'Choose a plan first.' };
  const parsed = aboutYou.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: first(parsed.error) };
  const audit = await freeAuditSummary(String(form.get('audit') ?? ''));

  let userId: string;
  try {
    userId = (await createUser({ email: parsed.data.email, name: parsed.data.name, role: 'customer', password: parsed.data.password })).id;
  } catch (err) {
    if (err instanceof UserExistsError) return { error: 'An account with this email already exists. Log in instead.' };
    throw err;
  }
  await createAccount({
    userId,
    businessName: parsed.data.businessName,
    phone: parsed.data.phone || null,
    plan,
    website: audit ? `https://${audit.domain}/` : null,
    sourceAuditId: audit?.id ?? null,
  });
  const base = (process.env.APP_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim() || '').replace(/\/$/, '');
  await sendMail(
    parsed.data.email,
    `Welcome to MS SCORE: your ${TRIAL_DAYS}-day trial has started`,
    emailLayout({
      heading: `Welcome, ${parsed.data.name.split(' ')[0]}`,
      paragraphs: [
        `Your ${PLANS[plan].name} trial for ${parsed.data.businessName} has started. It runs for ${TRIAL_DAYS} days and there is nothing to pay today.`,
        'Finish the short setup (your website, area and services) so we can focus on the searches that bring you customers. Our team will then contact you about the first fixes.',
      ],
      button: base ? { label: 'Continue setup', href: `${base}/signup/website` } : undefined,
    }),
  );

  try {
    await signIn('credentials', { email: parsed.data.email, password: parsed.data.password, redirectTo: stepPath(2) });
  } catch (err) {
    if (err instanceof CredentialsSignin || err instanceof AuthError) redirect('/login?next=/signup/website');
    throw err; // the success redirect is thrown too
  }
  return {};
}

/** Step 2: the website all work focuses on. */
export async function saveWebsiteAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const { user, account } = await currentCustomer();
  const website = websiteOrigin(String(form.get('website') ?? ''));
  if (!website) return { error: 'Enter your website address, for example https://yourbusiness.com' };
  await updateAccount(user.id!, { website, onboardingStep: Math.max(account.onboardingStep, 3) });
  redirect(stepPath(3));
}

const LANGUAGES = ['English', 'Urdu', 'Arabic', 'Spanish', 'French', 'Other'];

/** Step 3: country, cities/areas served, website language. */
export async function saveAreaAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const { user, account } = await currentCustomer();
  const country = String(form.get('country') ?? '').trim().slice(0, 80);
  const areas = list(form, 'areas');
  const language = String(form.get('language') ?? '');
  if (!country) return { error: 'Enter the country your customers are in.' };
  if (!areas.length) return { error: 'Add at least one city or area you serve (type it and press Enter).' };
  await updateAccount(user.id!, {
    country,
    areas,
    otherCountries: form.get('otherCountries') === 'on',
    language: LANGUAGES.includes(language) ? language : 'English',
    onboardingStep: Math.max(account.onboardingStep, 4),
  });
  redirect(stepPath(4));
}

/** Step 4: services and known competitors. */
export async function saveServicesAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const { user, account } = await currentCustomer();
  const services = list(form, 'services');
  if (!services.length) return { error: 'Add at least one service (type it and press Enter).' };
  await updateAccount(user.id!, { services, competitors: list(form, 'competitors'), onboardingStep: Math.max(account.onboardingStep, 5) });
  redirect(stepPath(5));
}

/**
 * Step 5: which connections they can give us and consent to prepare changes (nothing is
 * connected today; the team sets it up). Finishes onboarding and, when the free audit was
 * of another site, starts a first audit of their website.
 */
export async function finishSignupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const { user, account } = await currentCustomer();
  const connections = list(form, 'connections').filter((c): c is Connection => (CONNECTIONS as readonly string[]).includes(c));
  const consent = form.get('consent') === 'on';
  const now = new Date().toISOString();
  await updateAccount(user.id!, { connections, consentChanges: consent, consentAt: consent ? now : null, onboardingStep: FINISHED, onboardedAt: now });

  const free = await freeAuditSummary(account.sourceAuditId);
  const answers = [
    `Business: ${account.businessName} (${user.name}, ${user.email ?? ''}${account.phone ? `, ${account.phone}` : ''})`,
    `Plan: ${PLANS[account.plan].name}, trial until ${account.trialEndsAt.slice(0, 10)}`,
    `Website: ${account.website ?? '-'}`,
    `Area: ${[account.country, ...account.areas].filter(Boolean).join(', ') || '-'}${account.otherCountries ? ' (+ other countries)' : ''}, language ${account.language ?? '-'}`,
    `Services: ${account.services.join(', ') || '-'}; competitors: ${account.competitors.join(', ') || '-'}`,
    `Can connect: ${connections.join(', ') || 'nothing yet'}; may prepare changes: ${consent ? 'yes' : 'no'}`,
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
  await startAutopilot(user.id!);
  redirect('/my?welcome=1');
}
