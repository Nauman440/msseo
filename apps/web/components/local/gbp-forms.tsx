'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  chooseLocationAction, disconnectGbpAction, draftPostAction, draftReplyAction, postReplyAction, publishPostAction, saveProfileLinkAction, type GbpState,
} from '@/app/local/gbp-actions';
import { INPUT, Message, SELECT_SM, Submit } from '@/components/competitors/forms';

/** Business Profile controls (client). Nothing reaches Google until a person presses Post or Publish. */
export function ProfileLinkForm({ domain, link }: { domain: string; link: string | null }) {
  const [state, action] = useActionState<GbpState, FormData>(saveProfileLinkAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Google Maps link to your Business Profile
        <input name="link" defaultValue={link ?? ''} placeholder="https://maps.app.goo.gl/… or a place ID" maxLength={1000} className={`${INPUT} min-h-10 text-sm font-normal`} />
      </label>
      <p className="text-[12.5px] text-ink-2">On Google Maps, open your business, press <b>Share</b> and copy the link. Leave empty to let us find it by name.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save profile link" busy="Checking the link…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

export function ChooseLocationForm({ domain, options }: { domain: string; options: { key: string; label: string; matches: boolean }[] }) {
  const [state, action] = useActionState<GbpState, FormData>(chooseLocationAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Which profile is this website’s?
        <select name="location" defaultValue={options.find((o) => o.matches)?.key ?? options[0]?.key} className={`${SELECT_SM} max-w-full font-normal`}>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}{o.matches ? ' (links to this website)' : ''}</option>)}
        </select>
      </label>
      <Submit label="Use this profile" busy="Saving…" />
      <Message state={state} />
    </form>
  );
}

export function DisconnectGbp({ domain }: { domain: string }) {
  const [state, action] = useActionState<GbpState>(disconnectGbpAction.bind(null, domain), {});
  return (
    <form action={action} className="flex items-center gap-2">
      <button type="submit" className="min-h-10 px-1 text-sm font-semibold text-fail-text underline">Disconnect</button>
      <Message state={state} />
    </form>
  );
}

export function ReplyForm({ domain, review }: { domain: string; review: { name: string; stars: number | null; comment: string; reviewer: string; reply: string | null } }) {
  const [text, setText] = useState(review.reply ?? '');
  const [note, setNote] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [state, action] = useActionState<GbpState, FormData>(postReplyAction.bind(null, domain, review.name), {});
  const draft = () =>
    startDraft(async () => {
      const r = await draftReplyAction(domain, { stars: review.stars, comment: review.comment, reviewer: review.reviewer });
      if (r.draft) setText(r.draft);
      setNote(r.error ?? null);
    });
  const id = `reply-${review.name.replace(/\W/g, '').slice(-16)}`;
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">Reply to {review.reviewer}</label>
      <textarea id={id} name="reply" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} placeholder="Write a reply…" className={`${INPUT} py-2 text-sm`} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={draft} disabled={drafting} className="min-h-10 rounded-[8px] border border-border bg-surface px-3 text-[13px] font-semibold text-ink-2 hover:border-ink-3 disabled:opacity-60">
          {drafting ? 'Writing…' : 'Write with AI'}
        </button>
        <Submit label={review.reply ? 'Update reply' : 'Post reply'} busy="Posting…" tone="secondary" />
        {note && <p role="alert" className="text-[13px] text-fail-text">{note}</p>}
        <Message state={state} />
      </div>
    </form>
  );
}

export function PostComposer({ domain, website }: { domain: string; website: string }) {
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [action, setAction] = useState('LEARN_MORE');
  const [note, setNote] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [state, publish] = useActionState<GbpState, FormData>(publishPostAction.bind(null, domain), {});
  const draft = () =>
    startDraft(async () => {
      const r = await draftPostAction(domain, topic);
      if (r.draft) setText(r.draft);
      setNote(r.error ?? null);
    });
  return (
    <form action={publish} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-bold">
          What is the post about? (optional)
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="Furnace tune-ups before winter" className={`${INPUT} min-h-10 text-sm font-normal`} />
        </label>
        <button type="button" onClick={draft} disabled={drafting} className="min-h-10 rounded-[8px] border border-border bg-surface px-3 text-[13px] font-semibold text-ink-2 hover:border-ink-3 disabled:opacity-60">
          {drafting ? 'Writing…' : 'Write with AI'}
        </button>
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Post text
        <textarea name="summary" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={1500} className={`${INPUT} py-2 text-sm font-normal`} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Button
          <select name="action" value={action} onChange={(e) => setAction(e.target.value)} className={`${SELECT_SM} font-normal`}>
            <option value="LEARN_MORE">Learn more</option>
            <option value="BOOK">Book</option>
            <option value="CALL">Call now</option>
            <option value="">No button</option>
          </select>
        </label>
        {action && action !== 'CALL' && (
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-bold">
            Page the button opens
            <input name="url" defaultValue={website} maxLength={500} className={`${INPUT} min-h-10 text-sm font-normal`} />
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Publish on Google" busy="Publishing…" />
        {note && <p role="alert" className="text-[13px] text-fail-text">{note}</p>}
        <Message state={state} />
      </div>
    </form>
  );
}
