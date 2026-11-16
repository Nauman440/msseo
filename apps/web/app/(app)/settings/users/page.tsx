import type { Metadata } from 'next';
import { ActionForm } from '@/components/forms/ActionForm';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { requireAdmin } from '@/lib/session';
import { cn } from '@/lib/tones';
import { listUsers } from '@/lib/users';
import { createUserAction, resetPasswordAction, updateUserAction } from '../actions';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const LABEL = 'flex flex-col gap-1.5 text-sm font-semibold';
const SMALL_BUTTON = 'inline-flex min-h-10 items-center rounded-button border border-border-strong px-3.5 text-sm font-semibold hover:border-ink-3';

/** Admin user management (spec §4): add, disable/enable, change role, reset password. */
export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await listUsers();

  return (
    <Container className="flex flex-col gap-10 py-12">
      <SectionHeader align="left" eyebrow="Settings" title="Team members" intro="Admins can add people, switch accounts off and reset passwords. Members can run and export audits." />

      <section className="rounded-panel border border-border bg-surface p-6">
        <h2 className="mb-4 font-display text-lg font-bold">Add a team member</h2>
        <ActionForm action={createUserAction} submit="Add member">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={LABEL}>
              Name
              <input name="name" autoComplete="off" className={INPUT} />
            </label>
            <label className={LABEL}>
              Email
              <input name="email" type="email" required autoComplete="off" className={INPUT} />
            </label>
            <label className={LABEL}>
              Role
              <select name="role" defaultValue="member" className={INPUT}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className={LABEL}>
              Starting password
              <input name="password" type="text" required minLength={10} autoComplete="off" className={INPUT} />
            </label>
          </div>
        </ActionForm>
      </section>

      <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
        {users.map((u) => {
          const self = u.id === me.id;
          return (
            <li key={u.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {u.name || u.email}
                    {self && <span className="ml-2 text-[13px] font-normal text-ink-3">(you)</span>}
                  </p>
                  <p className="text-[13px] text-ink-3">{u.email}</p>
                </div>
                <span className={cn('rounded-pill px-2.5 py-1 text-xs font-bold', u.role === 'admin' ? 'bg-primary-chip text-primary-heading' : 'bg-sunken text-ink-2')}>{u.role === 'admin' ? 'Admin' : 'Member'}</span>
                <span className={cn('rounded-pill px-2.5 py-1 text-xs font-bold', u.active ? 'bg-pass-bg text-pass-text' : 'bg-high-bg text-high-text')}>{u.active ? 'Active' : 'Disabled'}</span>
              </div>
              {!self && (
                <div className="flex flex-wrap items-end gap-2">
                  <form action={updateUserAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="active" value={String(!u.active)} />
                    <button type="submit" className={SMALL_BUTTON}>{u.active ? 'Disable' : 'Enable'}</button>
                  </form>
                  <form action={updateUserAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="role" value={u.role === 'admin' ? 'member' : 'admin'} />
                    <button type="submit" className={SMALL_BUTTON}>{u.role === 'admin' ? 'Make member' : 'Make admin'}</button>
                  </form>
                  <ActionForm action={resetPasswordAction} submit="Set password" tone="secondary" className="flex-row flex-wrap items-end">
                    <input type="hidden" name="id" value={u.id} />
                    <label className="sr-only" htmlFor={`pw-${u.id}`}>
                      New password for {u.email}
                    </label>
                    <input id={`pw-${u.id}`} name="password" type="text" required minLength={10} placeholder="New password" autoComplete="off" className={cn(INPUT, 'w-48')} />
                  </ActionForm>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
