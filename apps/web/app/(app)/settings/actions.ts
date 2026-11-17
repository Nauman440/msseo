'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/forms/ActionForm';
import { requireAdmin, requireUser } from '@/lib/session';
import { createUser, findUserById, updateUser, UserExistsError, verifyPassword } from '@/lib/users';

const password = z.string().min(10, 'Passwords need at least 10 characters').max(200);
const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the form.';

const newUser = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(['admin', 'member']),
  password,
});

/** Admin: add a team member with a starting password they can change later. */
export async function createUserAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = newUser.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  try {
    const user = await createUser({ ...parsed.data, name: parsed.data.name || null });
    revalidatePath('/settings/users');
    return { ok: `Added ${user.email}. Share the starting password with them privately.` };
  } catch (err) {
    if (err instanceof UserExistsError) return { error: err.message };
    throw err;
  }
}

/** Admin: enable/disable an account or change its role. Admins cannot lock themselves out. */
export async function updateUserAction(form: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(form.get('id') ?? '');
  if (!id || id === me.id) return;
  const active = form.get('active');
  const role = form.get('role');
  await updateUser(id, {
    ...(active === 'true' || active === 'false' ? { active: active === 'true' } : {}),
    ...(role === 'admin' || role === 'member' ? { role } : {}),
  });
  revalidatePath('/settings/users');
}

/** Admin: set a new password for someone who forgot theirs. */
export async function resetPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.object({ id: z.string().min(1), password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await updateUser(parsed.data.id, { password: parsed.data.password });
  return { ok: 'Password updated. Share it with them privately.' };
}

const changeOwn = z
  .object({ current: z.string().min(1, 'Enter your current password'), password, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: 'The new passwords do not match', path: ['confirm'] });

/** Anyone: change their own password (needs the current one). */
export async function changePasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!me.id) return { error: 'Login is not switched on in this environment.' };
  const parsed = changeOwn.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const user = await findUserById(me.id);
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) return { error: 'Your current password is not right.' };
  await updateUser(me.id, { password: parsed.data.password });
  return { ok: 'Your password has been changed.' };
}

/** Anyone on the team: change the name shown in the app and on audits they run. */
export async function updateOwnNameAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser();
  if (!me.id) return { error: 'Login is not switched on in this environment.' };
  const name = String(form.get('name') ?? '').trim().slice(0, 100);
  if (!name) return { error: 'Enter your name.' };
  await updateUser(me.id, { name });
  revalidatePath('/', 'layout');
  return { ok: 'Your name has been saved.' };
}

/** Admin: remove the Search Console connection (audits then skip GSC checks). */
export async function disconnectGscAction(): Promise<ActionState> {
  await requireAdmin();
  const { deleteGscConnection } = await import('@seo/db');
  await deleteGscConnection();
  revalidatePath('/settings/search-console');
  return { ok: 'Search Console disconnected.' };
}

/** Admin: save the audit settings (spec §4). */
export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  if (!process.env.DATABASE_URL) return { error: 'Settings need the database (DATABASE_URL).' };
  const { settingsSchema } = await import('@seo/core');
  const parsed = settingsSchema.safeParse({
    'crawl.defaultLimit': form.get('crawl.defaultLimit'),
    'crawl.maxLimit': form.get('crawl.maxLimit'),
    'crawl.enableJsDefault': form.get('crawl.enableJsDefault') === 'on',
    'lighthouse.maxTemplates': form.get('lighthouse.maxTemplates'),
    'report.maxExampleUrlsClient': form.get('report.maxExampleUrlsClient'),
    'public.enabled': form.get('public.enabled') === 'on',
    'public.dailyCap': form.get('public.dailyCap'),
    'ai.checks': form.get('ai.checks') === 'on',
    'ai.maxPages': form.get('ai.maxPages'),
    'ai.maxTokens': form.get('ai.maxTokens'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { saveSettings } = await import('@seo/db');
  await saveSettings(parsed.data);
  revalidatePath('/settings/general');
  return { ok: 'Settings saved. New audits use them straight away.' };
}

/** Admin: permanently delete one audit (spec §4). */
export async function deleteAuditAction(auditId: string, projectId: string): Promise<ActionState> {
  await requireAdmin();
  if (!process.env.DATABASE_URL) return { error: 'Deleting audits needs the database.' };
  const { deleteAuditRecord } = await import('@seo/db');
  if (!(await deleteAuditRecord(auditId))) return { error: 'That audit no longer exists.' };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/dashboard');
  return { ok: 'Audit deleted.' };
}

/** Admin: change a customer's status, or extend their trial by 7 days (step 8; no payments yet). */
export async function updateCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const { getAccountByUserId, updateAccount } = await import('@/lib/accounts');
  const userId = String(form.get('userId') ?? '');
  const account = await getAccountByUserId(userId);
  if (!account) return { error: 'Customer not found.' };
  const op = form.get('op');
  if (op === 'extend') {
    const from = Math.max(Date.now(), Date.parse(account.trialEndsAt));
    await updateAccount(userId, { trialEndsAt: new Date(from + 7 * 86_400_000).toISOString(), status: 'trial' });
  } else if (op === 'active' || op === 'cancelled' || op === 'trial') {
    await updateAccount(userId, { status: op });
  } else {
    return { error: 'Unknown change.' };
  }
  revalidatePath('/settings/customers');
  return { ok: 'Saved.' };
}
