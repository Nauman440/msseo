'use server';

import { revalidatePath } from 'next/cache';
import { normDomain, type GbpCallToAction } from '@seo/core';
import { competitorAccess } from '@/lib/competitors';
import { chooseGbpLocation, disconnectGbp, draftGbpPost, draftReply, gbpError, gbpLocations, postReply, publishPost, saveProfileLink } from '@/lib/gbp';
import { hit } from '@/lib/rate-limit';

/** Google Business Profile actions on the Local page (team and the site's customer). */
export type GbpState = { error?: string; ok?: string; draft?: string };

async function guard(rawDomain: string) {
  const domain = normDomain(rawDomain);
  const viewer = await competitorAccess(domain);
  if (!viewer) throw new Error('Not allowed');
  return { domain, by: viewer.kind === 'customer' ? ('customer' as const) : ('team' as const) };
}
const paths = (domain: string) => {
  revalidatePath(`/local/${domain}`);
  revalidatePath('/my/local');
};

export async function saveProfileLinkAction(rawDomain: string, _prev: GbpState, form: FormData): Promise<GbpState> {
  const { domain } = await guard(rawDomain);
  const r = await saveProfileLink(domain, String(form.get('link') ?? '').slice(0, 1000));
  paths(domain);
  if (r === 'invalid') return { error: 'That is not a Business Profile link. Open your business on Google Maps, press Share, copy the link and paste it here.' };
  return { ok: r === 'cleared' ? 'Removed. The audit will search Google Maps for the business again.' : 'Saved. The next Local audit and the weekly checks use this profile.' };
}

export async function chooseLocationAction(rawDomain: string, _prev: GbpState, form: FormData): Promise<GbpState> {
  const { domain } = await guard(rawDomain);
  const key = String(form.get('location') ?? '');
  try {
    const loc = (await gbpLocations(domain)).find((l) => `${l.account}|${l.location}` === key);
    if (!loc) return { error: 'Choose one of the profiles in the list.' };
    await chooseGbpLocation(domain, loc);
    paths(domain);
    return { ok: `Connected to ${loc.title}.` };
  } catch (err) {
    return { error: gbpError(err) };
  }
}

export async function disconnectGbpAction(rawDomain: string): Promise<GbpState> {
  const { domain } = await guard(rawDomain);
  await disconnectGbp(domain);
  paths(domain);
  return { ok: 'Disconnected.' };
}

export async function draftReplyAction(rawDomain: string, review: { stars: number | null; comment: string; reviewer: string }): Promise<GbpState> {
  const { domain } = await guard(rawDomain);
  if (!(await hit(`gbp-draft:${domain}`, 60, 24 * 60 * 60)).allowed) return { error: 'Enough drafts for today. Write this one by hand, or try again tomorrow.' };
  try {
    return { draft: await draftReply(domain, review) };
  } catch (err) {
    return { error: `The draft could not be written: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}` };
  }
}

export async function postReplyAction(rawDomain: string, reviewName: string, _prev: GbpState, form: FormData): Promise<GbpState> {
  const { domain, by } = await guard(rawDomain);
  const text = String(form.get('reply') ?? '').trim();
  if (text.length < 2) return { error: 'Write a reply first.' };
  if (text.length > 4000) return { error: 'Keep the reply under 4,000 characters.' };
  try {
    await postReply(domain, reviewName, text, by);
    paths(domain);
    return { ok: 'Reply posted on Google.' };
  } catch (err) {
    return { error: gbpError(err) };
  }
}

export async function draftPostAction(rawDomain: string, topic: string): Promise<GbpState> {
  const { domain } = await guard(rawDomain);
  if (!(await hit(`gbp-draft:${domain}`, 60, 24 * 60 * 60)).allowed) return { error: 'Enough drafts for today.' };
  try {
    return { draft: await draftGbpPost(domain, topic) };
  } catch (err) {
    return { error: `The draft could not be written: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}` };
  }
}

const ACTIONS: GbpCallToAction[] = ['CALL', 'LEARN_MORE', 'BOOK'];
export async function publishPostAction(rawDomain: string, _prev: GbpState, form: FormData): Promise<GbpState> {
  const { domain, by } = await guard(rawDomain);
  const summary = String(form.get('summary') ?? '').trim();
  const action = ACTIONS.find((a) => a === form.get('action')) ?? null;
  const url = String(form.get('url') ?? '').trim() || null;
  if (summary.length < 20) return { error: 'Write at least a couple of sentences.' };
  if (summary.length > 1500) return { error: 'Google allows up to 1,500 characters.' };
  if (action && action !== 'CALL' && !/^https:\/\//.test(url ?? '')) return { error: 'Add the page the button opens (https://…).' };
  try {
    await publishPost(domain, { summary, action, url: action === 'CALL' ? null : url }, by);
    paths(domain);
    return { ok: 'Published on your Business Profile. Google may take a few minutes to show it.' };
  } catch (err) {
    return { error: gbpError(err) };
  }
}
