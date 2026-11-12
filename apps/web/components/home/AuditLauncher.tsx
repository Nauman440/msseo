const AUDIENCES = [
  { value: 'client', label: 'Client report' },
  { value: 'expert', label: 'SEO expert' },
] as const;

/** Plain GET form → /audits/new pre-fills the full form (§5.1). Works without JS. */
export function AuditLauncher() {
  return (
    <form action="/audits/new" method="get" className="w-full max-w-xl">
      <div className="flex flex-col gap-2 rounded-[20px] border border-white/[0.12] bg-white/[0.06] p-2 shadow-lift backdrop-blur sm:flex-row sm:items-center sm:rounded-full">
        <label htmlFor="launch-url" className="sr-only">
          Website URL
        </label>
        <input
          id="launch-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          required
          placeholder="clientwebsite.com"
          className="h-12 min-w-0 flex-1 rounded-full bg-transparent px-5 text-[15px] text-white placeholder:text-white/40 focus:outline-none"
        />
        <button
          type="submit"
          className="h-12 shrink-0 rounded-full bg-brand px-6 text-sm font-semibold text-night transition hover:brightness-105"
        >
          Run audit
        </button>
      </div>

      <fieldset className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <legend className="sr-only">Report for</legend>
        <span className="text-[13px] text-white/45">Report for</span>
        {AUDIENCES.map((a, i) => (
          <label key={a.value} className="group relative cursor-pointer">
            <input type="radio" name="audience" value={a.value} defaultChecked={i === 0} className="peer sr-only" />
            <span className="inline-flex h-8 items-center rounded-full border border-white/[0.12] px-3.5 text-[13px] font-medium text-white/60 transition peer-checked:border-primary-tint/60 peer-checked:bg-primary/25 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
              {a.label}
            </span>
          </label>
        ))}
      </fieldset>
    </form>
  );
}
