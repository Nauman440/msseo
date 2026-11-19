'use server';

import { revalidatePath } from 'next/cache';
import { normDomain } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { runAltText } from '@/lib/alt-text';
import { runContent } from '@/lib/content';

/** Module 7 action (team and the site's customer). */
export type ContentState = { error?: string; ok?: string };

export async function runContentAction(rawDomain: string): Promise<ContentState> {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  try {
    const r = await runContent(domain, viewer.kind === 'customer' ? 'customer' : 'team');
    revalidatePath(`/content/${domain}`);
    revalidatePath('/my/content');
    if (r.problem === 'too-often') return { error: 'You can run the content audit twice a day. Try again tomorrow.' };
    const a = r.audit!;
    if (!a.inventory.length) return { error: 'No pages to review yet. Run a site audit first, then check content again.' };
    return { ok: `${a.inventory.length} pages reviewed: ${a.counts.improve} to improve, ${a.counts.merge} to merge, ${a.counts.remove} to remove.` };
  } catch (err) {
    return { error: `The content audit did not finish: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown error'}` };
  }
}

/** Module 2 "Automate": alt-text drafts for images without alt. */
export async function runAltTextAction(rawDomain: string): Promise<ContentState> {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  try {
    const r = await runAltText(domain, viewer.kind === 'customer' ? 'customer' : 'team');
    revalidatePath(`/content/${domain}`);
    revalidatePath('/my/content');
    if (r.problem === 'too-often') return { error: 'You can draft alt text twice a day. Try again tomorrow.' };
    if (r.problem === 'no-audit') return { error: 'Run a site audit first: the drafts are for the audited pages.' };
    const d = r.doc!;
    return { ok: d.missing ? `${d.missing} images without alt text on ${d.pagesChecked} pages; ${d.drafts.length} drafts written.` : `No images without alt text on the ${d.pagesChecked} pages checked.` };
  } catch (err) {
    return { error: `The drafts could not be written: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown error'}` };
  }
}
