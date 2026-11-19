import type { Verdict } from '@seo/core';

/** 7.2 verdict labels and colours (screen and PDF). */
export const VERDICT: Record<Verdict, { label: string; tone: string; hint: string }> = {
  keep: { label: 'Keep', tone: 'bg-teal-chip text-teal-text', hint: 'Working, leave it' },
  improve: { label: 'Improve', tone: 'bg-indigo-bg text-indigo-text', hint: 'Worth updating' },
  merge: { label: 'Merge', tone: 'bg-warn-bg text-warn-text', hint: 'Combine with another page' },
  remove: { label: 'Remove', tone: 'bg-high-bg text-high-strong', hint: 'Thin and no visits' },
};
