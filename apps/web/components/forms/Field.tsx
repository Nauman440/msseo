import type { ReactNode } from 'react';

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] leading-5 text-ink-3">{hint}</p>}
    </div>
  );
}

/** Radio card. Native input stays focusable; the card reflects its state via `peer`. */
export function Choice({
  name,
  value,
  checked,
  title,
  body,
}: {
  name: string;
  value: string;
  checked?: boolean;
  title: string;
  body: string;
}) {
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="block h-full rounded-tile border border-border-strong p-4 transition peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-[13px] leading-5 text-ink-2">{body}</span>
      </span>
    </label>
  );
}
