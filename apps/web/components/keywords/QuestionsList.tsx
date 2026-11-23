'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import type { AiPrompt } from '@seo/core';
import { addPromptAction, editPromptAction, generatePromptsAction, saveTrackedPromptsAction, type KeywordState } from '@/app/keywords/actions';
import { INPUT, Message, Submit } from '@/components/competitors/forms';

const OTHER = 'Other questions';
const GROUPS_SHOWN = 3;
const SMALL_BUTTON = 'min-h-9 rounded-[8px] border border-border bg-surface px-2.5 text-[13px] font-semibold text-ink-2 hover:text-ink';

/**
 * Questions for AI (design): written from the topics, ticked for tracking, edited or added by
 * hand. The ticked ones are what we ask ChatGPT in the competitor analysis and, once AI search
 * tracking starts, every week.
 */
export function QuestionsList({ domain, prompts, writtenAt }: { domain: string; prompts: AiPrompt[]; writtenAt: string | null }) {
  const ticked = () => new Set(prompts.filter((p) => p.tracked !== false).map((p) => p.id));
  const [tracked, setTracked] = useState(ticked);
  // Saved questions changed (written, added, edited or tracked): start from what was saved.
  const signature = prompts.map((p) => `${p.id}:${p.tracked !== false}:${p.text}`).join('|');
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setTracked(ticked());
  }
  const [topic, setTopic] = useState('');
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<KeywordState>({});
  const [pending, startTransition] = useTransition();
  const [written, write] = useActionState<KeywordState>(generatePromptsAction.bind(null, domain), {});
  const [added, add] = useActionState<KeywordState, FormData>(addPromptAction.bind(null, domain), {});

  const groups = useMemo(() => {
    const map = new Map<string, AiPrompt[]>();
    for (const p of prompts) map.set(p.service ?? OTHER, [...(map.get(p.service ?? OTHER) ?? []), p]);
    return [...map];
  }, [prompts]);
  const filtered = topic ? groups.filter(([g]) => g === topic) : groups;
  const visible = all || topic ? filtered : filtered.slice(0, GROUPS_SHOWN);
  const dirty = prompts.some((p) => (p.tracked !== false) !== tracked.has(p.id));
  const toggle = (id: string) =>
    setTracked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const run = (fn: () => Promise<KeywordState>) => startTransition(async () => setSaved(await fn()));
  const date = writtenAt ? new Date(writtenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-card bg-night px-6 py-[22px]">
        <div className="min-w-0 flex-1 basis-[280px]">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.07em] text-primary-tint">
            {date ? `Written ${date} · ${prompts.length} questions` : 'No questions yet'}
          </p>
          <h2 className="mt-1.5 font-display text-[22px] font-bold text-white">Questions people ask AI assistants</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-mist-3">
            Written from your keywords. Tick the ones your customers would really ask: we put the ticked questions to ChatGPT, Perplexity and Google’s AI (see the AI search tab) to see whether they recommend you or someone else.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <form action={write}>
            <Submit label="Write new questions" busy="Writing…" tone="dark" />
          </form>
          {prompts.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => saveTrackedPromptsAction(domain, [...tracked]))}
              className="inline-flex min-h-12 items-center rounded-control bg-primary px-[22px] text-[15px] font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-70"
            >
              {pending ? 'Saving…' : `Track ${tracked.size} ${tracked.size === 1 ? 'question' : 'questions'}`}
            </button>
          )}
        </div>
        <div className="w-full empty:hidden [&_p]:text-primary-tint">
          <Message state={written} />
        </div>
      </div>

      {prompts.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="flex min-w-[200px] flex-col gap-1 text-[12px] font-bold text-ink-2">
            Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className={`${INPUT} text-sm text-ink`}>
              <option value="">All topics</option>
              {groups.map(([g]) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <div aria-live="polite">{dirty ? <p className="text-[13px] font-semibold text-primary-text">Changes not saved yet</p> : <Message state={saved} />}</div>
        </div>
      )}

      {visible.map(([group, list]) => (
        <section key={group} aria-label={group} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-[22px] py-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h3 className="text-[17px] font-bold">{group}</h3>
            <span className="text-[13px] text-ink-2">{list.length} {list.length === 1 ? 'question' : 'questions'}</span>
          </div>
          <ul>
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-border py-3">
                <input type="checkbox" checked={tracked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Track: ${p.text}`} className="size-5 shrink-0 accent-primary" />
                {editing === p.id ? (
                  <>
                    <label className="sr-only" htmlFor={`edit-${p.id}`}>Edit question</label>
                    <input id={`edit-${p.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} className={`${INPUT} min-w-[240px] flex-1 text-sm`} />
                    <button type="button" disabled={pending} className={SMALL_BUTTON} onClick={() => run(async () => { const r = await editPromptAction(domain, p.id, draft); if (!r.error) setEditing(null); return r; })}>Save</button>
                    <button type="button" className={SMALL_BUTTON} onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="min-w-[240px] flex-1 text-[14.5px] leading-snug">{p.text}</span>
                    <button type="button" aria-label={`Edit question: ${p.text}`} className={SMALL_BUTTON} onClick={() => { setEditing(p.id); setDraft(p.text); }}>Edit</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!topic && filtered.length > GROUPS_SHOWN && (
        <p className="text-center text-sm text-ink-2">
          Showing {visible.length} of {filtered.length} topics.{' '}
          <button type="button" onClick={() => setAll(!all)} className="font-semibold text-primary-text underline">{all ? 'Show fewer' : 'Show all'}</button>
        </p>
      )}

      <form action={add} className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface px-[22px] py-5">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[13px] font-bold">
          Add a question your customers ask
          <input name="question" maxLength={300} placeholder="For example: Who can service my AC before summer?" className={`${INPUT} text-sm font-normal`} />
        </label>
        {topic && <input type="hidden" name="topic" value={topic === OTHER ? '' : topic} />}
        <Submit label="Add question" busy="Adding…" />
        <div className="w-full empty:hidden">
          <Message state={added} />
        </div>
      </form>
    </div>
  );
}
