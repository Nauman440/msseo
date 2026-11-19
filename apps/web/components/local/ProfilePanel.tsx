import type { GbpLocation, GbpPost, GbpReview } from '@seo/core';
import { cn } from '@/lib/tones';
import { ChooseLocationForm, DisconnectGbp, PostComposer, ProfileLinkForm, ReplyForm } from './gbp-forms';

/**
 * "Your Business Profile" on the Local page: the profile link used by the audits, and the optional
 * connection to answer reviews and publish posts (server component; no token reaches the browser).
 */
export type ProfilePanelData = {
  domain: string;
  link: string | null;
  ref: string | null;
  connectReady: boolean;
  connection: { email: string; title: string | null; chosen: boolean } | null;
  locations: (GbpLocation & { matches: boolean })[] | null;
  live: { reviews: GbpReview[]; averageRating: number | null; total: number | null; posts: GbpPost[] } | null;
  error: string | null;
};
const CARD = 'flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-6';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const stars = (n: number | null) => (n ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)}` : '–');

export function ProfilePanel({ d }: { d: ProfilePanelData }) {
  const unanswered = d.live?.reviews.filter((r) => !r.reply) ?? [];
  const answered = d.live?.reviews.filter((r) => r.reply) ?? [];
  return (
    <section id="business-profile" aria-labelledby="gbp-title" className={CARD}>
      <h2 id="gbp-title" className="font-display text-xl font-bold">Your Business Profile</h2>
      {d.error && <p role="alert" className="rounded-[10px] bg-warn-bg px-3 py-2 text-sm text-warn-text">{d.error}</p>}
      <ProfileLinkForm domain={d.domain} link={d.link} />
      {d.ref && <p className="text-[12.5px] text-ink-3">Using {d.ref.startsWith('cid:') ? 'profile id' : 'place id'} {d.ref.replace(/^\w+:/, '')}.</p>}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-bold">Answer reviews and post updates from here</h3>
        {!d.connection ? (
          <>
            <p className="text-sm text-ink-2">Connect the Google account that manages the profile (owner or manager). Replies and posts are only sent when you press Post or Publish.</p>
            {d.connectReady ? (
              <a href={`/api/gbp/connect?site=${encodeURIComponent(d.domain)}`} className="inline-flex min-h-11 items-center self-start rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover">Connect Business Profile</a>
            ) : (
              <p className="text-sm text-ink-2">Not available on this server yet.</p>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Connected as <b>{d.connection.email}</b>{d.connection.title ? <> · <b>{d.connection.title}</b></> : ''}</span>
            <DisconnectGbp domain={d.domain} />
          </div>
        )}
        {d.connection && !d.connection.chosen && d.locations && (
          d.locations.length ? (
            <ChooseLocationForm domain={d.domain} options={d.locations.map((l) => ({ key: `${l.account}|${l.location}`, label: `${l.title}${l.website ? ` · ${l.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}`, matches: l.matches }))} />
          ) : (
            <p className="text-sm text-ink-2">This Google account does not manage any Business Profile. Sign in with the owner or a manager of the profile.</p>
          )
        )}
      </div>

      {d.live && (
        <>
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="font-bold">
              Reviews to answer ({unanswered.length})
              {d.live.averageRating !== null && <span className="ml-2 font-normal text-ink-2">· {d.live.averageRating.toFixed(1)} from {d.live.total?.toLocaleString('en-US') ?? '–'} reviews</span>}
            </h3>
            {unanswered.length ? (
              <ul className="flex flex-col gap-4">
                {unanswered.slice(0, 10).map((r) => (
                  <li key={r.name} className="flex flex-col gap-2 rounded-[14px] border border-border p-4">
                    <p className="text-sm"><b>{r.reviewer}</b> <span aria-label={`${r.stars ?? 'no'} stars`} className={cn('ml-1', (r.stars ?? 5) <= 3 ? 'text-high-strong' : 'text-amber-bar')}>{stars(r.stars)}</span> <span className="text-ink-3">· {day(r.createTime)}</span></p>
                    {r.comment && <p className="text-sm text-ink-2">{r.comment}</p>}
                    <ReplyForm domain={d.domain} review={{ name: r.name, stars: r.stars, comment: r.comment, reviewer: r.reviewer, reply: null }} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Every recent review has a reply.</p>
            )}
            {answered.length > 0 && <p className="text-[12.5px] text-ink-3">{answered.length} of the latest {d.live.reviews.length} reviews already have a reply.</p>}
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="font-bold">Publish an update</h3>
            <p className="text-sm text-ink-2">Profiles that post every week or two look active to Google and to customers. {d.live.posts[0] ? `Last post: ${day(d.live.posts[0].createTime)}.` : 'No posts yet.'}</p>
            <PostComposer domain={d.domain} website={`https://${d.domain}/`} />
          </div>
        </>
      )}
    </section>
  );
}
