'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { SIGNUP_INPUT } from './styles';

/**
 * "Type a place and press Enter" list (areas, services, competitors). Each value is
 * submitted as a hidden input named `name`; a typed value not yet added is kept too.
 */
export function TagInput({ name, label, hint, placeholder, initial = [], optional = false }: { name: string; label: string; hint: string; placeholder: string; initial?: string[]; optional?: boolean }) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');
  const id = useId();

  const add = (value: string) => {
    const v = value.trim().replace(/,$/, '').trim();
    if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) setTags([...tags, v]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-bold text-ink">
        {label} {optional && <span className="font-normal text-ink-3">(optional)</span>}
      </label>
      <p id={`${id}-hint`} className="text-[13px] text-ink-3">{hint}</p>
      {tags.length > 0 && (
        <ul className="mb-1 flex flex-wrap gap-2" aria-label={`${label} added`}>
          {tags.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-night py-1 pl-3.5 pr-1 text-sm font-semibold text-mist">
              {t}
              <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="flex size-7 items-center justify-center rounded-full text-mist-2 hover:bg-night-3 hover:text-mist">
                ×
              </button>
              <input type="hidden" name={name} value={t} />
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        className={SIGNUP_INPUT}
      />
      {/* A value typed but not yet added still counts when the form is sent (no add-on-blur:
          the new chip would shift the Continue button just as it is clicked). */}
      {draft.trim() && <input type="hidden" name={name} value={draft.trim()} />}
    </div>
  );
}
