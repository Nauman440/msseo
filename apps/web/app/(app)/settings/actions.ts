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
