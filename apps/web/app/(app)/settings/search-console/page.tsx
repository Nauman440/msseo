import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getGscConnection, gscProperties, gscSetup } from '@seo/db';
import { ActionForm } from '@/components/forms/ActionForm';
import { Container, SectionHeader } from '@/components/landing/primitives';
import { googleOAuth } from '@/lib/google-oauth';
import { requireAdmin } from '@/lib/session';
import { disconnectGscAction } from '../actions';

export const metadata: Metadata = { title: 'Search Console' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ connected?: string; error?: string }> };

const BUTTON = 'inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-ink hover:bg-primary-hover';

/** Admin: the agency-level Google Search Console connection (spec §5.5). */
export default async function SearchConsolePage({ searchParams }: Props) {
  await requireAdmin();
  const params = await searchParams;
  const setup = gscSetup();
  const connection = setup.ready ? await getGscConnection().catch(() => null) : null;
  let properties: string[] = [];
  let listError: string | null = null;
  if (connection) {
    try {
      properties = await gscProperties();
    } catch (err) {
      listError = err instanceof Error ? err.message : 'Could not list properties.';
    }
  }
  const redirectUri = googleOAuth(await headers()).redirectUri;

  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-12">
      <SectionHeader
        align="left"
        eyebrow="Settings"
        title="Search Console"
        intro="Connect the team Google account that has access to client properties. Audits can then add indexing, query and click data. Read-only: MS SCORE never changes anything in Search Console."
      />

      {params.connected && <p role="status" className="rounded-tile bg-pass-bg px-4 py-3 text-sm font-semibold text-pass-text">Search Console connected.</p>}
      {params.error && <p role="alert" className="rounded-tile bg-fail-bg px-4 py-3 text-sm font-semibold text-fail-text">{params.error}</p>}

      {!setup.ready ? (
        <section className="rounded-panel border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-bold">Server settings needed</h2>
          <p className="mt-2 text-sm leading-6 text-ink-2">Add these environment variables to the web app and the worker, then redeploy:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 font-mono text-[13px]">
            {setup.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : connection ? (
        <section className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-6">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">Connected account</p>
            <p className="mt-1 break-all font-display text-lg font-bold">{connection.googleEmail}</p>
            <p className="text-[13px] text-ink-3">Since {connection.createdAt.toISOString().slice(0, 10)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{listError ? 'Properties could not be listed' : `${properties.length} ${properties.length === 1 ? 'property' : 'properties'} available`}</p>
            {listError ? (
              <p className="mt-1 text-sm text-fail-text">{listError}</p>
            ) : (
              <ul className="mt-2 max-h-72 overflow-y-auto rounded-tile border border-border font-mono text-[13px]">
                {properties.map((p) => (
                  <li key={p} className="break-all border-b border-border px-3 py-2 last:border-0">{p}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <a href="/api/gsc/connect" className={BUTTON}>Reconnect</a>
            <ActionForm action={disconnectGscAction} submit="Disconnect" tone="secondary">{null}</ActionForm>
          </div>
        </section>
      ) : (
        <section className="rounded-panel border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-bold">Not connected</h2>
          <p className="mt-2 text-sm leading-6 text-ink-2">Sign in with the Google account that can see your clients’ Search Console properties.</p>
          <a href="/api/gsc/connect" className={`${BUTTON} mt-4`}>Connect Search Console</a>
        </section>
      )}

      <p className="text-[13px] leading-6 text-ink-3">
        Redirect URI for the Google Cloud OAuth client: <span className="break-all font-mono text-ink-2">{redirectUri}</span>
      </p>
    </Container>
  );
}
