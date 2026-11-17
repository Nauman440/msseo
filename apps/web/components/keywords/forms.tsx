'use client';

import { useActionState, useRef, useState } from 'react';
import { COMPETITOR_COUNTRIES, COMPETITOR_LANGUAGES, SEED_LIMITS, type BusinessType, type KeywordSeeds } from '@seo/core';
import {
  addKeywordsAction, clusterKeywordsAction, generatePromptsAction, researchKeywordsAction, saveKeywordSeedsAction, updateClusterAction, sendClustersToCompetitorsAction,
  type KeywordState,
} from '@/app/keywords/actions';
import { INPUT, Message, Submit } from '@/components/competitors/forms';
import { TagInput } from '@/components/signup/TagInput';

const KINDS: { value: BusinessType; label: string; hint: string }[] = [
  { value: 'services', label: 'Services', hint: 'Visits, repairs or bookings in an area' },
  { value: 'shop', label: 'Products', hint: 'An online shop' },
];

/** 4.1 seeds: what kind of business, country, language, services or products, places, brands and extra topics. */
export function SeedsForm({ domain, businessType, country, language, seeds }: { domain: string; businessType: BusinessType; country: string; language: string; seeds: KeywordSeeds }) {
  const [state, action] = useActionState<KeywordState, FormData>(saveKeywordSeedsAction.bind(null, domain), {});
  const [kind, setKind] = useState<BusinessType>(businessType);
  const shop = kind === 'shop';
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">What do you sell?</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {KINDS.map((k) => (
            <label key={k.value} className="cursor-pointer">
              <input type="radio" name="businessType" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="peer sr-only" />
              <span className="flex flex-col rounded-tile border border-border p-3.5 peer-checked:border-night peer-checked:bg-sunken peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                <span className="font-semibold">{k.label}</span>
                <span className="text-[13px] text-ink-3">{k.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Country
          <select name="country" defaultValue={country} className={INPUT}>
            {COMPETITOR_COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Language
          <select name="language" defaultValue={language} className={INPUT}>
            {Object.entries(COMPETITOR_LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <TagInput
        name="services"
        label={shop ? 'Products and categories' : 'Services'}
        hint={shop ? `What you sell, e.g. "duvet covers". Up to ${SEED_LIMITS.services}.` : `What you sell, e.g. "AC repair". Up to ${SEED_LIMITS.services}.`}
        placeholder={shop ? 'For example: duvet covers' : 'For example: furnace installation'}
        initial={seeds.services}
      />
      {/* Shops sell everywhere they deliver: the country above is enough. */}
      <div hidden={shop}>
        <TagInput name={shop ? 'locations-unused' : 'locations'} label="Places you serve" hint="Cities or areas. Searches for other places are removed." placeholder="For example: Dallas" initial={seeds.locations} optional />
      </div>
      <TagInput
        name="brands"
        label={shop ? 'Brands you sell' : 'Brands and equipment'}
        hint={shop ? 'Leave empty if you only sell your own brand.' : 'Brands you install or repair, e.g. Trane, Carrier.'}
        placeholder={shop ? 'For example: Christy' : 'For example: Trane'}
        initial={seeds.brands}
        optional
      />
      <TagInput
        name="extra"
        label="Other words customers use"
        hint={shop ? 'Materials, styles, sizes or problems your customers mention.' : 'Anything your sales team hears: problems, questions, offers.'}
        placeholder={shop ? 'For example: cooling bedding' : 'For example: ac blowing warm air'}
        initial={seeds.extra}
        optional
      />
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save" busy="Saving…" tone="secondary" />
        <Message state={state} />
      </div>
    </form>
  );
}

/** 4.2–4.7 runs: research (which also builds the clusters) and prompts; the team can rebuild clusters after edits. */
export function KeywordRunButtons({ domain, hasKeywords, hasClusters, audience }: { domain: string; hasKeywords: boolean; hasClusters: boolean; audience: 'team' | 'customer' }) {
  const [research, runResearch] = useActionState<KeywordState>(researchKeywordsAction.bind(null, domain), {});
  const [cluster, runCluster] = useActionState<KeywordState>(clusterKeywordsAction.bind(null, domain), {});
  const [prompts, runPrompts] = useActionState<KeywordState>(generatePromptsAction.bind(null, domain), {});
  const [sent, send] = useActionState<KeywordState>(sendClustersToCompetitorsAction.bind(null, domain), {});
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2.5">
        {hasClusters && (
          <form action={send}>
            <Submit label="Use topics to find competitors" busy="Sending…" tone="secondary" />
          </form>
        )}
        <form action={runPrompts}>
          <Submit label="Write AI questions" busy="Writing…" tone="secondary" />
        </form>
        {hasKeywords && audience === 'team' && (
          <form action={runCluster}>
            <Submit label="Rebuild topics" busy="Checking Google…" tone="secondary" />
          </form>
        )}
        <form action={runResearch}>
          <Submit label={hasKeywords ? 'Update keywords' : 'Research keywords'} busy="Researching and grouping… (about a minute)" />
        </form>
      </div>
      {[research, cluster, prompts, sent].map((s, i) => (
        <Message key={i} state={s} />
      ))}
    </div>
  );
}

/** Add keywords by hand, or import a CSV (first or "keyword"/"query" column). */
export function AddKeywordsForm({ domain }: { domain: string }) {
  const [state, action] = useActionState<KeywordState, FormData>(addKeywordsAction.bind(null, domain), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Keywords
        <textarea name="terms" rows={3} placeholder="One per line, or separated by commas" className={`${INPUT} py-2`} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Or a CSV file <span className="text-[13px] font-normal text-ink-3">(for example a Search Console or Google Ads export)</span>
        <input type="file" name="file" accept=".csv,.txt,text/csv,text/plain" className="text-sm file:mr-3 file:min-h-10 file:rounded-control file:border file:border-border-strong file:bg-surface file:px-3 file:font-semibold" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Add keywords" busy="Adding…" />
        <Message state={state} />
      </div>
    </form>
  );
}

const SCALE = [1, 2, 3, 4, 5];

/** 4.6 hand-set business value and chance to rank; saved as soon as one changes. */
export function ClusterScores({ domain, id, name, businessValue, rankingChance }: { domain: string; id: string; name: string; businessValue: number; rankingChance: number }) {
  const form = useRef<HTMLFormElement>(null);
  const [, action] = useActionState<KeywordState, FormData>(updateClusterAction.bind(null, domain, id), {});
  const select = (field: 'businessValue' | 'rankingChance', label: string, value: number) => (
    <label className="flex min-w-[100px] flex-col gap-1 text-[12px] font-bold text-ink-2">
      {label}
      <select name={field} defaultValue={value} aria-label={`${label} for ${name}`} onChange={() => form.current?.requestSubmit()} className={`${INPUT} text-sm text-ink`}>
        {SCALE.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
  return (
    <form ref={form} action={action} className="flex flex-wrap gap-3">
      {select('businessValue', 'Value to you', businessValue)}
      {select('rankingChance', 'Chance to rank', rankingChance)}
    </form>
  );
}
