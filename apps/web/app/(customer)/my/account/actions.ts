'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import type { ActionState } from '@/components/forms/ActionForm';
import { accountSites, getAccountByUserId, isPlan, PLANS, updateAccount } from '@/lib/accounts';
import { publicOrigin } from '@/lib/google-oauth';
import { emailLayout, notifyTeam, sendMail } from '@/lib/mailer';
import { requireCustomer } from '@/lib/session';
import { findUserById, updateUser, verifyPassword } from '@/lib/users';

/** Customer account settings (/my/account): details, business answers, password. */
const first = (e: z.ZodError) => e.issues[0]?.message ?? 'Please check the form.';
const list = (form: FormData, name: string, max = 50) =>
  [...new Set(form.getAll(name).map((v) => String(v).trim()).filter(Boolean))].slice(0, max).map((v) => v.slice(0, 120));

const details = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  businessName: z.string().trim().min(1, 'Enter your business name').max(120),
  phone: z.string().trim().max(40).optional(),
});

export async function saveDetailsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireCustomer();
  const parsed = details.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: first(parsed.error) };
  await updateUser(user.id, { name: parsed.data.name });
  await updateAccount(user.id, { businessName: parsed.data.businessName, phone: parsed.data.phone || null });
  revalidatePath('/my', 'layout');
  return { ok: 'Your details have been saved.' };
}

const LANGUAGES = ['English', 'Urdu', 'Arabic', 'Spanish', 'French', 'Other'];

export async function saveBusinessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireCustomer();
  if (!(await getAccountByUserId(user.id))) return { error: 'No account found.' };
  const country = String(form.get('country') ?? '').trim().slice(0, 80);
  const language = String(form.get('language') ?? '');
  const services = list(form, 'services');
  if (!country) return { error: 'Enter your country.' };
  if (!LANGUAGES.includes(language)) return { error: 'Choose the language of your website.' };
  if (!services.length) return { error: 'Add at least one service (press Enter after each).' };
  await updateAccount(user.id, {
    country,
    language,
    areas: list(form, 'areas'),
    otherCountries: form.get('otherCountries') === 'on',
    services,
    competitors: list(form, 'competitors', 20),
  });
  revalidatePath('/my', 'layout');
  return { ok: 'Saved. Our team sees the update, and keyword and competitor pages you have not set up yet start from these answers.' };
}

const changeOwn = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password: z.string().min(8, 'Use at least 8 characters').max(200),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'The new passwords do not match', path: ['confirm'] });

export async function changeCustomerPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireCustomer();
  const parsed = changeOwn.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: first(parsed.error) };
  const user = await findUserById(me.id);
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) return { error: 'Your current password is not right.' };
  await updateUser(me.id, { password: parsed.data.password });
  return { ok: 'Your password has been changed.' };
}

// ---- Plan: switch, cancel, restart (no payment provider yet: the team invoices by hand) ----

async function planContext() {
  const user = await requireCustomer();
  const account = await getAccountByUserId(user.id);
  if (!account) throw new Error('No account');
  return { user, account };
}

/** Tells the team (they invoice by hand) and, when given, the customer. */
async function announce(team: string, lines: string[], customer?: { to: string | null; subject: string; heading: string; lines: string[] }) {
  await notifyTeam(team, emailLayout({ heading: team, paragraphs: lines }));
  if (customer?.to) await sendMail(customer.to, customer.subject, emailLayout({ heading: customer.heading, paragraphs: customer.lines, button: { label: 'Open your account', href: `${publicOrigin(await headers())}/my/account` } }));
}

export async function changePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { user, account } = await planContext();
  const plan = form.get('plan');
  if (!isPlan(plan)) return { error: 'Choose a plan.' };
  if (plan === account.plan) return { ok: `You are already on ${PLANS[plan].name}.` };
  if (account.status === 'cancelled') return { error: 'Restart your plan first, then change it.' };
  const sites = accountSites(account).length;
  if (sites > PLANS[plan].websites) {
    return { error: `${PLANS[plan].name} covers ${PLANS[plan].websites} website. Remove ${sites - PLANS[plan].websites} from your dashboard first, then switch.` };
  }
  await updateAccount(user.id, { plan });
  const from = PLANS[account.plan];
  const to = PLANS[plan];
  await announce(`Plan change: ${account.businessName}`, [
    `${account.businessName} (${user.email}) moved from ${from.name} (${from.price}${from.unit}) to ${to.name} (${to.price}${to.unit}).`,
    `Status: ${account.status}${account.status === 'trial' ? `, trial ends ${account.trialEndsAt.slice(0, 10)}` : ''}. Update the invoice if they are paying.`,
  ]);
  revalidatePath('/my', 'layout');
  return { ok: `You are now on ${to.name}${to.websites > 1 ? `: add up to ${to.websites} websites on your dashboard` : ''}.` };
}

export async function cancelPlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { user, account } = await planContext();
  if (account.status === 'cancelled') return { ok: 'Your plan is already cancelled.' };
  if (form.get('confirm') !== 'on') return { error: 'Tick the box to confirm.' };
  const reason = String(form.get('reason') ?? '').trim().slice(0, 500);
  await updateAccount(user.id, { status: 'cancelled' });
  await announce(
    `Cancelled: ${account.businessName}`,
    [`${account.businessName} (${user.email}) cancelled ${PLANS[account.plan].name} (was ${account.status}).`, reason ? `Reason: ${reason}` : 'No reason given.'],
    {
      to: user.email,
      subject: 'Your MS SCORE plan is cancelled',
      heading: 'Your plan is cancelled',
      lines: ['Weekly checks have stopped and no new audits will run. Your reports stay in your account.', 'Changed your mind? Restart your plan from your account at any time.'],
    },
  );
  revalidatePath('/my', 'layout');
  return { ok: 'Your plan is cancelled. Your reports stay here, and you can restart at any time.' };
}

export async function restartPlanAction(): Promise<ActionState> {
  const { user, account } = await planContext();
  if (account.status !== 'cancelled') return { ok: 'Your plan is already running.' };
  const inTrial = Date.parse(account.trialEndsAt) > Date.now();
  await updateAccount(user.id, { status: inTrial ? 'trial' : 'active' });
  await announce(`Restarted: ${account.businessName}`, [
    `${account.businessName} (${user.email}) restarted ${PLANS[account.plan].name}: now ${inTrial ? `on trial until ${account.trialEndsAt.slice(0, 10)}` : 'active (send an invoice)'}.`,
  ]);
  revalidatePath('/my', 'layout');
  return { ok: inTrial ? 'Welcome back. Your free trial continues.' : 'Welcome back. Your plan is active again; we will send your invoice.' };
}
