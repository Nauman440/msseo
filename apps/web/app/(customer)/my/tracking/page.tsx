import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<{ site?: string }> };

/** This tab was removed from the customer area (2026-11-25); old links land on the overview. */
export default async function RemovedTab({ searchParams }: Props) {
  const { site } = await searchParams;
  redirect(site ? `/my?site=${encodeURIComponent(site)}` : '/my');
}
