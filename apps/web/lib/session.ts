import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { findUserById, isTeamRole, type Role } from './users';

/** Login is on whenever AUTH_SECRET is set (always on the server; see middleware). */
export const authEnabled = () => Boolean(process.env.AUTH_SECRET);

export type SessionUser = { id: string | null; name: string; email: string | null; role: Role; local?: true };

/**
 * The signed-in team member, re-read from the user store on every request, so a
 * disabled account stops working at once (not when its 7-day cookie expires).
 * Without AUTH_SECRET (local development) everyone is a local admin.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!authEnabled()) return { id: null, name: 'Local developer', email: null, role: 'admin', local: true };
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await findUserById(session.user.id);
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name || user.email, email: user.email, role: user.role };
}

/** A team member (admin or member). Customers are sent to their own area, /my. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!isTeamRole(user.role)) redirect('/my');
  return user;
}

/** A signed-up customer (step 8); team members are sent to the dashboard. */
export async function requireCustomer(): Promise<SessionUser & { id: string }> {
  const user = await getSessionUser();
  if (!user?.id) redirect('/login?next=/my');
  if (user.role !== 'customer') redirect('/dashboard');
  return user as SessionUser & { id: string };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}
