'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { DEFAULT_PAGE_LIMIT, PAGE_LIMIT_OPTIONS, type Audience } from '@seo/core';
import { createAuditAction, type NewAuditState } from '@/app/(app)/audits/new/actions';
import { Choice, Field } from './Field';

const INPUT =
  'h-11 w-full rounded-control border border-border-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-fail-text';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
      {pending ? 'Starting…' : 'Start audit'}
    </button>
  );
}

export function NewAuditForm({
  defaultUrl,
  audience,
  ready,
  pagespeedReady,
  emailReady,
}: {
  defaultUrl: string;
  audience: Audience;
  ready: boolean;
  pagespeedReady: boolean;
  emailReady: boolean;
}) {
  const [state, action] = useActionState<NewAuditState, FormData>(createAuditAction, {});
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="mt-8 space-y-6 rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
      {state.error && (
        <p role="alert" className="rounded-tile border border-fail-text/20 bg-fail-bg px-4 py-3 text-sm font-medium text-fail-text">
          {state.error}
        </p>
      )}

      <Field id="url" label="Website URL" error={err.url}>
        <input id="url" name="url" type="text" inputMode="url" required defaultValue={defaultUrl} placeholder="example.com" aria-invalid={!!err.url} aria-describedby={err.url ? 'url-error' : undefined} className={INPUT} />
      </Field>

      <Field id="project" label="Project">
        <select id="project" name="project" className={INPUT} defaultValue="new">
          <option value="new">Create new project from this domain</option>
        </select>
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Report for</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Choice name="audience" value="client" checked={audience === 'client'} title="Client report" body="Plain language, top issues, client-ready PDF." />
          <Choice name="audience" value="expert" checked={audience === 'expert'} title="SEO expert report" body="Checklist IDs, every affected URL, raw values." />
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field id="pageLimit" label="Page limit" error={err.pageLimit} hint="How many pages to audit. More pages take longer and use more API credits.">
          <select id="pageLimit" name="pageLimit" defaultValue={DEFAULT_PAGE_LIMIT} className={`${INPUT} tabular`}>
            {PAGE_LIMIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="gsc" label="Search Console property" hint="Search Console checks are skipped when none is selected.">
          <select id="gsc" name="gsc" className={INPUT} defaultValue="">
            <option value="">None (skip these checks)</option>
          </select>
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="js" defaultChecked className="mt-1 size-4 accent-primary" />
        <span>
          <span className="block text-sm font-semibold">JavaScript rendering</span>
          <span className="block text-[13px] text-ink-3">For page builders and JS frameworks. Uses more API credits.</span>
        </span>
      </label>

      <div className="rounded-tile border border-primary/15 bg-primary-soft p-4 sm:p-5">
        <Field
          id="notifyEmail"
          label="Email me the full report"
          error={err.notifyEmail}
          hint={emailReady ? 'Optional. The full PDF report is sent here when the audit finishes.' : 'Optional. Saved with the audit; sending starts once an email service is connected.'}
        >
          <input id="notifyEmail" name="notifyEmail" type="email" autoComplete="email" placeholder="you@company.com" aria-invalid={!!err.notifyEmail} className={INPUT} />
        </Field>
      </div>

      <div className="flex flex-col-reverse items-start gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-ink-3">
          {ready
            ? `Live data via DataForSEO${pagespeedReady ? ' + PageSpeed Insights' : ''}. Usually 2–5 minutes.`
            : 'Add DataForSEO keys to .env to run audits.'}
        </p>
        <SubmitButton disabled={!ready} />
      </div>
    </form>
  );
}
