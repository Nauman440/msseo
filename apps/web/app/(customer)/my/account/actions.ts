'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/forms/ActionForm';
import { getAccountByUserId, updateAccount } from '@/lib/accounts';
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
