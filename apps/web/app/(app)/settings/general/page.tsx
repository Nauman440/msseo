import type { Metadata } from 'next';
import { PAGE_LIMIT_OPTIONS } from '@seo/core';
import { ActionForm } from '@/components/forms/ActionForm';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { requireAdmin } from '@/lib/session';
import { appSettings } from '@/lib/settings';
import { saveSettingsAction } from '../actions';

export const metadata: Metadata = { title: 'Audit settings' };
export const dynamic = 'force-dynamic';

const INPUT = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const LABEL = 'flex flex-col gap-1.5 text-sm font-semibold';
const HINT = 'text-[13px] font-normal text-ink-3';

/** Admin audit settings (spec §4): page limits, JS rendering default, PageSpeed page types, client URL count. */
export default async function GeneralSettingsPage() {
  await requireAdmin();
  const s = await appSettings();
  const hasDb = Boolean(process.env.DATABASE_URL);

  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-12">
      <SectionHeader as="h1" align="left" eyebrow="Settings" title="Audit settings" intro="Defaults and limits for every audit the team runs. Changes apply to new audits immediately." />
      {!hasDb && <p role="status" className="rounded-tile bg-primary-soft px-4 py-3 text-sm text-primary-text">Showing the built-in defaults. Saving needs the database.</p>}

      <section className="rounded-panel border border-border bg-surface p-6">
        <ActionForm action={saveSettingsAction} submit="Save settings">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className={LABEL}>
              Default page limit
              <select name="crawl.defaultLimit" defaultValue={s['crawl.defaultLimit']} className={INPUT}>
                {PAGE_LIMIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className={HINT}>Pre-selected on the new-audit form.</span>
            </label>
            <label className={LABEL}>
              Maximum page limit
              <select name="crawl.maxLimit" defaultValue={s['crawl.maxLimit']} className={INPUT}>
                {PAGE_LIMIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className={HINT}>Larger limits are hidden and refused. More pages cost more API credits.</span>
            </label>
            <label className={LABEL}>
              Page types measured with PageSpeed
              <input name="lighthouse.maxTemplates" type="number" min={1} max={6} defaultValue={s['lighthouse.maxTemplates']} className={`${INPUT} tabular`} />
              <span className={HINT}>1–6. Each type costs two PageSpeed calls (mobile and desktop).</span>
            </label>
            <label className={LABEL}>
              URLs per issue in client reports
              <input name="report.maxExampleUrlsClient" type="number" min={1} max={50} defaultValue={s['report.maxExampleUrlsClient']} className={`${INPUT} tabular`} />
              <span className={HINT}>Expert reports always list every affected URL.</span>
            </label>
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="crawl.enableJsDefault" defaultChecked={s['crawl.enableJsDefault']} className="mt-1 size-4 accent-primary" />
            <span>
              <span className="block text-sm font-semibold">JavaScript rendering on by default</span>
              <span className={HINT}>About 3× slower and 10× the crawl cost; only needed for JS-built sites.</span>
            </span>
          </label>
        </ActionForm>
      </section>
    </Container>
  );
}
