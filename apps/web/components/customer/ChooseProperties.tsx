'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveGoogleChoiceAction, type ConnectState } from '@/app/(customer)/my/connect/actions';
import type { Ga4Option, GscOption } from '@/lib/customer-google';
import { cn } from '@/lib/tones';

/** "Choose what to connect" (design: Dashboard setup choose properties). */
const SELECT = 'min-h-12 w-full rounded-control border border-border-strong bg-surface px-3.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
const shown = (p: string) => (p.startsWith('sc-domain:') ? p.slice('sc-domain:'.length) : p);

function Step({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-night text-[13px] font-bold text-white">{n}</span>
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="text-[13px] text-ink-2">{sub}</p>
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center rounded-control bg-primary px-5 text-[15px] font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
      {pending ? 'Connecting…' : 'Connect and import'}
    </button>
  );
}

const IMPORTS = ['Up to 16 months of search clicks and positions', 'Index status of your pages', 'Visits by page and traffic source', 'Key events such as calls and form submits'];

export function ChooseProperties({ domain, gsc, ga4, current }: { domain: string; gsc: GscOption[]; ga4: Ga4Option[]; current: { gscProperty: string | null; ga4Property: string | null } }) {
  const [state, action] = useActionState<ConnectState, FormData>(saveGoogleChoiceAction.bind(null, domain), {});
  const accounts = useMemo(() => [...new Map(ga4.map((p) => [p.account, p.accountName])).entries()], [ga4]);
  const initialGa4 = ga4.find((p) => p.property === current.ga4Property) ?? ga4.find((p) => p.matches) ?? null;
  const [account, setAccount] = useState(initialGa4?.account ?? accounts[0]?.[0] ?? '');
  const [property, setProperty] = useState(initialGa4?.property ?? '');
  const [skipGa4, setSkipGa4] = useState(!ga4.length);
  const inAccount = ga4.filter((p) => p.account === account);
  const chosen = ga4.find((p) => p.property === property);

  return (
    <form action={action} className="flex flex-col">
      <div className="flex flex-col gap-7 px-6 py-6 sm:px-7">
        <section className="flex flex-col gap-3">
          <Step n={1} title="Search Console property" sub={gsc.some((g) => g.best) ? `We picked the one that matches ${domain}` : `Choose the property for ${domain}`} />
          {gsc.length ? (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="sr-only">Search Console property</legend>
              {gsc.map((g, i) => (
                <label key={g.property} className="group cursor-pointer">
                  <input type="radio" name="gscProperty" value={g.property} defaultChecked={current.gscProperty ? current.gscProperty === g.property : i === 0} className="peer sr-only" />
                  <span className="flex items-start gap-3 rounded-[12px] border border-border p-4 peer-checked:border-2 peer-checked:border-primary peer-checked:bg-[#FFF8F2] peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                    <span aria-hidden className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-border-strong bg-surface group-has-[:checked]:border-[6px] group-has-[:checked]:border-primary" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="break-all">{shown(g.property)}</span>
                        <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-bold text-ink-2">{g.kind}</span>
                        {g.best && <span className="rounded-full bg-teal-chip px-2 py-0.5 text-xs font-bold text-teal-text">Best match</span>}
                      </span>
                      <span className="block text-[13px] text-ink-2">{g.kind === 'Domain' ? 'Covers every version of your site: http, https, www and subdomains' : 'Only pages that start with this address'}</span>
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <p className="rounded-[12px] bg-sunken px-4 py-3 text-[13px] text-ink-2">
            Do not see your website? It is not in this Google account yet.{' '}
            <a href="https://support.google.com/webmasters/answer/34592" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-heading underline">
              Show me how to add it
            </a>
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <Step n={2} title="Google Analytics 4 property" sub="Used to count visits, calls and form leads" />
          {skipGa4 ? (
            <p className="text-sm text-ink-2">
              {ga4.length ? 'Analytics is skipped.' : 'This Google account has no Analytics 4 properties.'}{' '}
              {ga4.length > 0 && (
                <button type="button" onClick={() => setSkipGa4(false)} className="font-semibold text-primary-heading underline">
                  Use Analytics after all
                </button>
              )}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Account
                  <select value={account} onChange={(e) => {
                      setAccount(e.target.value);
                      setProperty(ga4.find((p) => p.account === e.target.value)?.property ?? '');
                    }} className={SELECT}>
                    {accounts.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Property
                  <select name="ga4Property" value={property} onChange={(e) => setProperty(e.target.value)} className={SELECT}>
                    <option value="">Choose a property</option>
                    {inAccount.map((p) => (
                      <option key={p.property} value={p.property}>{p.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
                {chosen?.matches && <span className="rounded-full bg-teal-chip px-2.5 py-1 text-xs font-bold text-teal-text">Web stream matches {domain}</span>}
                Not using Google Analytics?
                <button type="button" onClick={() => {
                    setSkipGa4(true);
                    setProperty('');
                  }} className="font-semibold text-primary-heading underline">
                  Skip Analytics
                </button>
              </p>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <Step n={3} title="What we will import" sub="Read-only. Nothing in your Google accounts changes." />
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {IMPORTS.map((t, i) => (
              <li key={t} className={cn('flex items-start gap-2 text-sm', skipGa4 && i >= 2 && 'text-ink-3 line-through')}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0">
                  <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </section>
        {state.error && <p role="alert" className="text-sm font-semibold text-fail-text">{state.error}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-[20px] border-t border-border bg-[#FAF8F4] px-6 py-4 sm:px-7">
        <p className="text-[13px] text-ink-2">You can change these later in Connections.</p>
        <div className="flex gap-3">
          <Link href={`/my?site=${encodeURIComponent(domain)}`} className="inline-flex min-h-12 items-center rounded-control border border-border-strong bg-surface px-5 text-[15px] font-semibold hover:border-ink-3">
            Back
          </Link>
          <Submit />
        </div>
      </div>
    </form>
  );
}
