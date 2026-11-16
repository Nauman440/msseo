const AUDIENCES = [
  { value: 'client', label: 'Client report' },
  { value: 'expert', label: 'SEO expert' },
] as const;

/**
 * Plain GET form → /audits/new pre-fills the full form (§5.1). Works without JS.
 * Same box as the landing page's website form (navy panel, white input, orange button).
 */
export function AuditLauncher() {
  return (
    <form action="/audits/new" method="get" className="flex max-w-[640px] flex-col gap-3 rounded-card border border-night-line bg-night-2 p-[18px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="launch-url" className="text-[13px] font-bold text-mist-2">
            Client website
          </label>
          <input
            id="launch-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            required
            placeholder="https://clientwebsite.com"
            className="min-h-[54px] w-full rounded-control border-0 bg-surface px-4 text-base text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button type="submit" className="min-h-[54px] shrink-0 rounded-button bg-primary px-[30px] text-base font-extrabold text-primary-ink transition-colors hover:bg-primary-hover">
          Run audit
        </button>
      </div>
      <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <legend className="sr-only">Report for</legend>
        <span className="text-[13px] text-mist-3">Report for</span>
        {AUDIENCES.map((a, i) => (
          <label key={a.value} className="relative cursor-pointer">
            <input type="radio" name="audience" value={a.value} defaultChecked={i === 0} className="peer sr-only" />
            <span className="inline-flex min-h-9 items-center rounded-full border border-night-line px-3.5 text-[13px] font-semibold text-mist-3 transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              {a.label}
            </span>
          </label>
        ))}
      </fieldset>
    </form>
  );
}
