'use server';

import { AuthError, CredentialsSignin } from 'next-auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { headers } from 'next/headers';
import { CONNECTIONS, createAccount, getAccountByUserId, isPlan, PLANS, TRIAL_DAYS, updateAccount, type Connection } from '@/lib/accounts';
import { billingError, cardOnFile, checkoutUrl, finishCardSetup, startCardSetup, stripeEnabled, stripePublishableKey } from '@/lib/billing';
import { publicOrigin } from '@/lib/google-oauth';
import { completeOnboarding } from '@/lib/onboarding';
import { signIn } from '@/lib/auth';
import { authEnabled, getSessionUser } from '@/lib/session';
import { freeAuditSummary, stepPath, websiteAddress } from '@/lib/signup';
import { emailLayout, sendMail } from '@/lib/mailer';
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

/** Creates the customer login + account (7-day trial) and sends the welcome email. */
async function createCustomerAccount(form: FormData): Promise<{ error: string } | { email: string; password: string }> {
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
    website: audit ? websiteAddress(audit.url) : null,
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
  return { email: parsed.data.email, password: parsed.data.password };
}

/** Step 1 (no card field): create the account, then sign in and go to step 2. */
export async function createAccountAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const made = await createCustomerAccount(form);
  if ('error' in made) return made;
  try {
    await signIn('credentials', { email: made.email, password: made.password, redirectTo: stepPath(2) });
  } catch (err) {
    if (err instanceof CredentialsSignin || err instanceof AuthError) redirect('/login?next=/signup/website');
    throw err; // the success redirect is thrown too
  }
  return {};
}

/** Step 1 with the card field: create the account and sign in without leaving the page (the browser then saves the card). */
export async function createAccountForCardAction(form: FormData): Promise<SignupState & { ok?: true }> {
  const made = await createCustomerAccount(form);
  if ('error' in made) return made;
  try {
    await signIn('credentials', { email: made.email, password: made.password, redirect: false });
  } catch (err) {
    if (err instanceof CredentialsSignin || err instanceof AuthError) return { error: 'Your account was created, but signing in failed. Log in to continue.' };
    throw err;
  }
  return { ok: true };
}

/** Card field: the client secret the browser confirms the card with (or done when a card is saved). */
export async function startCardSetupAction(): Promise<{ clientSecret?: string; done?: boolean; error?: string }> {
  const { user, account } = await currentCustomer();
  try {
    return await startCardSetup(account, { email: user.email ?? null, name: user.name });
  } catch (err) {
    return { error: billingError(err) };
  }
}

/** Card field: after Stripe confirmed the card in the browser. */
export async function finishCardSetupAction(setupIntentId: string): Promise<{ ok?: true; error?: string }> {
  const { account } = await currentCustomer();
  if (!/^seti_[A-Za-z0-9_]+$/.test(setupIntentId)) return { error: 'Your card was not confirmed. Please try again.' };
  try {
    return await finishCardSetup(account, setupIntentId);
  } catch (err) {
    return { error: billingError(err) };
  }
}

/** Step 2: the website all work focuses on. */
export async function saveWebsiteAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const { user, account } = await currentCustomer();
  const website = websiteAddress(String(form.get('website') ?? ''));
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
 * connected today; the team sets it up). With Stripe on, the customer then adds a card on
 * Stripe Checkout for the free trial (/api/stripe/return finishes sign-up); without it, sign-up
 * finishes here.
 */
export async function finishSignupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const { user, account } = await currentCustomer();
  const connections = list(form, 'connections').filter((c): c is Connection => (CONNECTIONS as readonly string[]).includes(c));
  const consent = form.get('consent') === 'on';
  await updateAccount(user.id!, { connections, consentChanges: consent, consentAt: consent ? new Date().toISOString() : null });
  const me = { id: user.id!, name: user.name, email: user.email ?? null };
  if (stripePublishableKey() && !cardOnFile(account)) return { error: 'Add your card above first. Nothing is charged during the free trial.' };
  if (stripeEnabled() && !cardOnFile(account)) {
    let url: string;
    try {
      url = await checkoutUrl({ account, email: me.email, origin: publicOrigin(await headers()), trial: true, cancelPath: '/signup/connect?payment=cancelled' });
    } catch (err) {
      return { error: `We could not open the payment page. ${billingError(err)}` };
    }
    redirect(url);
  }
  await completeOnboarding(me);
  redirect('/my?welcome=1');
}
