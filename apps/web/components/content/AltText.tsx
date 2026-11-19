'use client';

import { useActionState } from 'react';
import type { AltDraft } from '@seo/core';
import { runAltTextAction, type ContentState } from '@/app/content/actions';
import { Message, Submit } from '@/components/competitors/forms';
import { cn } from '@/lib/tones';

/** Module 2 "Automate": alt-text drafts (checked by a person, then pasted into the site). */
const CARD = 'flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-6';
const TH = 'whitespace-nowrap px-2.5 py-2 text-left text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink-2';
const TD = 'border-t border-border px-2.5 py-2.5 align-top';
const file = (src: string) => decodeURIComponent(src.split(/[?#]/)[0]!.split('/').pop() ?? src);
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

export function AltTextSection({ domain, doc }: { domain: string; doc: { runAt: string; pagesChecked: number; missing: number; drafts: AltDraft[] } | null }) {
  const [state, action] = useActionState<ContentState>(runAltTextAction.bind(null, domain), {});
  return (
    <section aria-labelledby="alt-title" className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="alt-title" className="font-display text-xl font-bold">Alt text for images</h2>
          <p className="text-sm text-ink-2">
            {doc ? `${doc.missing} images without alt text on ${doc.pagesChecked} pages (checked ${new Date(doc.runAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}).` : 'Finds images without alt text on the audited pages and drafts it for you.'} Check each draft, then paste it into the image’s alt field.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <form action={action}>
            <Submit label={doc ? 'Draft again' : 'Draft alt text'} busy="Looking at the images… (up to a minute)" tone="secondary" />
          </form>
          <Message state={state} />
        </div>
      </div>
      {doc && doc.drafts.length > 0 && (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr><th className={TH}>Image</th><th className={TH}>Page</th><th className={TH}>Suggested alt text</th></tr></thead>
              <tbody>
                {doc.drafts.map((d) => (
                  <tr key={d.src}>
                    <td className={cn(TD, 'max-w-[220px] break-all')}><a href={d.src} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{file(d.src)}</a></td>
                    <td className={cn(TD, 'break-all text-ink-2')}>{path(d.page)}</td>
                    <td className={TD}>{d.alt}{d.by === 'file name' && <span className="block text-[12px] text-ink-3">From the file name: check it matches the picture</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a href={`/api/content/${domain}/alt-text`} className="inline-flex min-h-10 items-center self-start text-sm font-semibold text-primary-heading underline">Download as CSV</a>
        </>
      )}
      {doc && doc.missing > doc.drafts.length && <p className="text-[12.5px] text-ink-3">{doc.missing - doc.drafts.length} images could not be drafted (the file could not be read and its name says nothing): write those by hand.</p>}
    </section>
  );
}
