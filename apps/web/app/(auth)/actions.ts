'use server';

import { AuthError, CredentialsSignin } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut } from '@/lib/auth';
import { authEnabled } from '@/lib/session';
import { headers } from 'next/headers';
import { emailLayout, mailReady, sendMail } from '@/lib/mailer';
import { resetToken, userForResetToken } from '@/lib/password-reset';
import { hit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/turnstile';
import { countUsers, createUser, findUserByEmail, updateUser } from '@/lib/users';

export type AuthFormState = { error?: string; ok?: string };

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

const SENT = 'If an account exists for that email, we have sent a link to set a new password. It works for 60 minutes.';

/** The public address for links in emails (APP_URL, else the request's host). */
async function publicBase(): Promise<string> {
  const fixed = (process.env.APP_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim() || '').replace(/\/$/, '');
  if (fixed) return fixed;
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
}

/** Forgot password: emails a 60-minute reset link. Same answer whether or not the account exists. */
export async function forgotPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!authEnabled()) return { error: 'Login is not configured on this server.' };
  if (!mailReady()) return { error: 'Password emails are not set up yet. Please contact us and we will reset it for you.' };
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: 'Enter a valid email address.' };
  const ip = clientIp(await headers()) ?? 'unknown';
  if (!(await hit(`reset:${ip}:${email}`, 3, 60 * 60)).allowed) return { ok: SENT };
  const user = await findUserByEmail(email);
  if (user?.active) {
    const link = `${await publicBase()}/reset-password?token=${encodeURIComponent(resetToken(user))}`;
    await sendMail(
      user.email,
      'Set a new MS SCORE password',
      emailLayout({
        heading: 'Set a new password',
        paragraphs: [
          `Hi ${user.name?.split(' ')[0] ?? 'there'}, someone asked to reset the password for your MS SCORE account.`,
          'The link works for 60 minutes. If it was not you, ignore this email: your password stays the same.',
        ],
        button: { label: 'Set a new password', href: link },
      }),
    );
  }
  return { ok: SENT };
}

const resetSchema = z
  .object({ token: z.string().min(10), password: z.string().min(8, 'Use at least 8 characters').max(200), confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: 'The passwords do not match', path: ['confirm'] });

/** Set a new password from the emailed link, then sign in. */
export async function resetPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  const user = await userForResetToken(parsed.data.token);
  if (!user) return { error: 'This link has expired or was already used. Ask for a new one.' };
  if (user.role !== 'customer' && parsed.data.password.length < 10) return { error: 'Team passwords need at least 10 characters.' };
  await updateUser(user.id, { password: parsed.data.password });
  return signInOrError(user.email, parsed.data.password, user.role === 'customer' ? '/my' : '/dashboard');
}
