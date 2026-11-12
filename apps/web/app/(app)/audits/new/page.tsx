import type { Metadata } from 'next';
import { DEFAULT_PAGE_LIMIT, PAGE_LIMIT_OPTIONS } from '@seo/core';
import { parseMode } from '@/lib/reports';
import { Field, Choice } from '@/components/forms/Field';

export const metadata: Metadata = { title: 'New audit' };

type Props = { searchParams: Promise<{ url?: string; audience?: string }> };

export default async function NewAuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const audience = parseMode(params.audience, 'client');
  const input = 'h-11 w-full rounded-control border border-border-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">New audit</p>
      <h1 className="mt-2 font-display text-[32px] font-bold tracking-display">Audit a website</h1>
      <p className="mt-2 text-[15px] text-ink-2">Technical (Module 1) and on-page (Module 2) checks. Takes 5–15 minutes.</p>

      <form className="mt-8 space-y-6 rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
        <Field id="url" label="Website URL">
          <input id="url" name="url" type="text" inputMode="url" required defaultValue={params.url ?? ''} placeholder="https://www.example.com" className={input} />
        </Field>

        <Field id="project" label="Project">
          <select id="project" name="project" className={input} defaultValue="new">
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
          <Field id="pageLimit" label="Page limit" hint="How many pages to audit. More pages take longer and use more API credits.">
            <select id="pageLimit" name="pageLimit" defaultValue={DEFAULT_PAGE_LIMIT} className={`${input} tabular`}>
              {PAGE_LIMIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="gsc" label="Search Console property" hint="Search Console checks are skipped when none is selected.">
            <select id="gsc" name="gsc" className={input} defaultValue="">
              <option value="">None (skip these checks)</option>
            </select>
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="js" defaultChecked className="mt-1 size-4 accent-primary" />
          <span>
            <span className="block text-sm font-semibold">JavaScript rendering</span>
            <span className="block text-[13px] text-ink-3">Turn on for sites built with page builders or JS frameworks.</span>
          </span>
        </label>

        <div className="rounded-tile border border-primary/15 bg-primary-soft p-4 sm:p-5">
          <Field id="notifyEmail" label="Email me the full report" hint="Optional. The full PDF report is sent here when the audit finishes.">
            <input
              id="notifyEmail"
              name="notifyEmail"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className={input}
            />
          </Field>
        </div>

        <div className="flex flex-col-reverse items-start gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-ink-3">Audit queue connects in Phase 1.</p>
          <button type="submit" disabled className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            Start audit
          </button>
        </div>
      </form>
    </div>
  );
}
