'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { DEFAULT_SETTINGS, matchGscProperties, normaliseUrl, pageLimitOptions, type AppSettings, type Audience } from '@seo/core';
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
      className="inline-flex min-h-11 items-center gap-2 rounded-button bg-primary px-6 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-primary-ink/30 border-t-primary-ink" aria-hidden="true" />}
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
  aiReady,
  gscProperties = [],
  gscConnected = false,
  settings = DEFAULT_SETTINGS,
}: {
  defaultUrl: string;
  audience: Audience;
  ready: boolean;
  pagespeedReady: boolean;
  emailReady: boolean;
  aiReady: boolean;
  /** All properties of the connected Google account; filtered here to the typed domain. */
  gscProperties?: string[];
  gscConnected?: boolean;
  /** Admin settings: default/maximum page limit and the JS-rendering default. */
  settings?: AppSettings;
}) {
  const [state, action] = useActionState<NewAuditState, FormData>(createAuditAction, {});
  const err = state.fieldErrors ?? {};
  const [url, setUrl] = useState(defaultUrl);
  const normalised = normaliseUrl(url);
  const matches = useMemo(() => (normalised ? matchGscProperties(gscProperties, normalised) : []), [normalised, gscProperties]);
  // null = follow the default (first match); '' = the user chose "None".
  const [gsc, setGsc] = useState<string | null>(null);
  const selectedGsc = gsc === '' || (gsc !== null && matches.includes(gsc)) ? gsc : (matches[0] ?? '');
  const gscHint = !gscConnected
    ? 'Search Console is not connected (an admin can connect it in Settings). These checks are skipped.'
    : matches.length
      ? 'Adds indexing, clicks and query checks from Google.'
      : normalised
        ? 'No property in the connected Google account matches this domain.'
        : 'Enter the website URL to see matching properties.';

  return (
    <form action={action} noValidate className="mt-8 space-y-6 rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
      {state.error && (
        <p role="alert" className="rounded-tile border border-fail-text/20 bg-fail-bg px-4 py-3 text-sm font-medium text-fail-text">
          {state.error}
        </p>
      )}

      <Field id="url" label="Website URL" error={err.url}>
        <input id="url" name="url" type="text" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" aria-invalid={!!err.url} aria-describedby={err.url ? 'url-error' : undefined} className={INPUT} />
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
          <select id="pageLimit" name="pageLimit" defaultValue={settings['crawl.defaultLimit']} className={`${INPUT} tabular`}>
            {pageLimitOptions(settings).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="gsc" label="Search Console property" error={err.gscProperty} hint={gscHint}>
          <select id="gsc" name="gsc" className={INPUT} value={selectedGsc} onChange={(e) => setGsc(e.target.value)}>
            {matches.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="">None (skip Search Console checks)</option>
          </select>
        </Field>
      </div>

      {selectedGsc && (
        <Field id="gscRange" label="Search Console date range" hint="Compared with the period before it, for traffic decay.">
          <select id="gscRange" name="gscRange" defaultValue="90" className={INPUT}>
            <option value="28">Last 28 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </Field>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Audit type</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Choice name="mode" value="quick" checked title="Quick audit · under 1 minute" body="Checks the key pages live. Best for most audits." />
          <Choice name="mode" value="deep" title="Deep crawl · 3–5 minutes" body="Follows every link: click depth, orphan pages and copied content." />
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="js" defaultChecked={settings['crawl.enableJsDefault']} className="mt-1 size-4 accent-primary" />
        <span>
          <span className="block text-sm font-semibold">JavaScript rendering</span>
          <span className="block text-[13px] text-ink-3">Only for sites built with JS frameworks or heavy page builders. About 3× slower and 10× the API cost.</span>
        </span>
      </label>

      <label className={aiReady ? 'flex cursor-pointer items-start gap-3' : 'flex cursor-not-allowed items-start gap-3 opacity-60'}>
        <input type="checkbox" name="ai" defaultChecked={aiReady} disabled={!aiReady} className="mt-1 size-4 accent-primary" />
        <span>
          <span className="block text-sm font-semibold">AI recommendations</span>
          <span className="block text-[13px] text-ink-3">
            {aiReady
              ? 'OpenAI turns the findings into a prioritised, step-by-step fix plan. It appears in the report about 30 seconds after the report opens.'
              : 'Add OPENAI_API_KEY to .env to turn this on.'}
          </span>
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
            ? `Live data via DataForSEO${pagespeedReady ? ' + PageSpeed Insights' : ''}. Quick audits take under a minute.`
            : 'Add DataForSEO keys to .env to run audits.'}
        </p>
        <SubmitButton disabled={!ready} />
      </div>
    </form>
  );
}
