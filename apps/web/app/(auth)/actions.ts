'use server';

import { AuthError, CredentialsSignin } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut } from '@/lib/auth';
import { authEnabled } from '@/lib/session';
import { countUsers, createUser } from '@/lib/users';

export type AuthFormState = { error?: string };

/** Only same-site paths, so the login page cannot be used to redirect elsewhere. */
const safeNext = (value: FormDataEntryValue | null) => {
  const s = typeof value === 'string' ? value : '';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/dashboard';
};

async function signInOrError(email: string, password: string, redirectTo: string): Promise<AuthFormState> {
  try {
    await signIn('credentials', { email, password, redirectTo });
  } catch (err) {
    if (err instanceof CredentialsSignin && err.code === 'rate_limited') return { error: 'Too many attempts. Wait 15 minutes, then try again.' };
    if (err instanceof AuthError) return { error: 'That email and password do not match an active account.' };
    throw err; // the success redirect is thrown too
  }
  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}

export async function loginAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!authEnabled()) return { error: 'Login is not configured on this server (AUTH_SECRET is missing).' };
  return signInOrError(String(form.get('email') ?? ''), String(form.get('password') ?? ''), safeNext(form.get('next')));
}

const setupSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(100),
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(10, 'Use at least 10 characters').max(200),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'The passwords do not match', path: ['confirm'] });

/** Creates the first admin. Only works while there are no accounts at all. */
export async function setupAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!authEnabled()) return { error: 'Add AUTH_SECRET to the server environment first, then reload this page.' };
  if ((await countUsers()) > 0) return { error: 'An admin already exists. Sign in instead.' };
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  await createUser({ email: parsed.data.email, name: parsed.data.name, role: 'admin', password: parsed.data.password });
  return signInOrError(parsed.data.email, parsed.data.password, '/dashboard');
}
