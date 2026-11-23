'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * The customer help assistant: a "Help" button on every customer page that opens a chat. Answers come from
 * /api/support/chat (help topics + the customer's own setup); "Ask a person" emails the chat to the team.
 * The conversation is kept for this browser tab only.
 */
type Msg = { role: 'user' | 'assistant'; text: string; links?: { label: string; href: string }[] };
const STORE = 'msscore-help';
const STARTERS = ['How do I connect Google Search Console?', 'My website is not in the Search Console list', 'How do I connect my WordPress site?', 'Where can I download my reports?'];
const WELCOME: Msg = { role: 'assistant', text: 'Hi! I can help you connect Google Search Console, your website and more, step by step. What do you need?' };

function load(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
}

export function SupportWidget() {
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [escalate, setEscalate] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMsgs(load()), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-20)));
    } catch {
      // Storage blocked: the chat still works for this page.
    }
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const site = () => params.get('site') ?? decodeURIComponent(document.cookie.match(/(?:^|; )my_site=([^;]*)/)?.[1] ?? '') ?? '';

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...msgs, { role: 'user' as const, text: question }];
    setMsgs(next);
    setText('');
    setBusy(true);
    setEscalate(null);
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.map(({ role, text: t }) => ({ role, text: t })), site: site(), page: path }),
      });
      const r = (await res.json()) as { answer?: string; links?: Msg['links']; suggestions?: string[]; error?: string };
      setMsgs([...next, { role: 'assistant', text: r.answer ?? r.error ?? 'Something went wrong. Please try again.', links: r.links ?? [] }]);
      setSuggestions(r.suggestions ?? []);
    } catch {
      setMsgs([...next, { role: 'assistant', text: 'I could not reach the server. Check your connection and try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function askPerson() {
    setBusy(true);
    try {
      const res = await fetch('/api/support/escalate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: msgs.map(({ role, text: t }) => ({ role, text: t })), site: site(), note: text }),
      });
      const r = (await res.json()) as { message?: string; error?: string };
      setEscalate(r.message ?? r.error ?? 'Sent.');
      setText('');
    } catch {
      setEscalate('Could not send. Please email support@msseo.tech.');
    } finally {
      setBusy(false);
    }
  }

  const shown = msgs.length ? msgs : [WELCOME];
  return (
    <div className="print:hidden">
      {open && (
        <section
          role="dialog"
          aria-label="Help assistant"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="fixed inset-x-3 bottom-20 z-50 flex max-h-[75dvh] flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[400px]"
        >
          <header className="flex items-center justify-between gap-3 bg-night px-4 py-3 text-white">
            <div>
              <h2 className="text-[15px] font-bold">Help assistant</h2>
              <p className="text-[12px] text-mist-3">Step-by-step help with setup and the tool</p>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button type="button" onClick={() => { setMsgs([]); setSuggestions(STARTERS); setEscalate(null); }} className="min-h-10 rounded-control px-2 text-[12px] font-semibold text-mist-3 hover:text-white">
                  New chat
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="flex size-10 items-center justify-center rounded-control text-xl text-mist-3 hover:text-white">
                ×
              </button>
            </div>
          </header>
          <div ref={list} aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto bg-canvas p-4">
            {shown.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'ml-8 self-end rounded-[14px] bg-night px-3.5 py-2.5 text-sm text-white' : 'mr-6 flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-3.5 py-2.5 text-sm'}>
                <p className="whitespace-pre-line break-words">{m.text}</p>
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.links.map((l) =>
                      l.href.startsWith('http') ? (
                        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary-chip px-2.5 py-1 text-[12px] font-bold text-primary-heading hover:underline">{l.label} ↗</a>
                      ) : (
                        <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-full bg-primary-chip px-2.5 py-1 text-[12px] font-bold text-primary-heading hover:underline">{l.label}</Link>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && <p className="mr-6 text-sm text-ink-2">Thinking…</p>}
            {!busy && suggestions.length > 0 && (
              <div className="flex flex-col items-start gap-1.5">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-left text-[13px] font-semibold hover:border-ink-3">{s}</button>
                ))}
              </div>
            )}
            {escalate && <p role="status" className="rounded-[12px] bg-teal-chip px-3 py-2 text-[13px] font-semibold text-teal-text">{escalate}</p>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="flex flex-col gap-2 border-t border-border p-3">
            <label htmlFor="help-q" className="sr-only">Your question</label>
            <textarea
              id="help-q"
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 800))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(text);
                }
              }}
              rows={2}
              placeholder="Ask how to do something…"
              className="w-full resize-none rounded-control border border-border-strong bg-surface px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={askPerson} disabled={busy || (!msgs.length && !text.trim())} className="min-h-10 rounded-control px-2 text-[13px] font-semibold text-primary-heading underline disabled:opacity-50">Ask a person</button>
              <button type="submit" disabled={busy || !text.trim()} className="inline-flex min-h-10 items-center rounded-button bg-primary px-4 text-sm font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-50">Send</button>
            </div>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-night px-5 text-sm font-bold text-white shadow-lg hover:bg-night-2 sm:right-6"
      >
        <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-ink">?</span>
        {open ? 'Close help' : 'Help'}
      </button>
    </div>
  );
}
