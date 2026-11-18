import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<{ site?: string }> };

/** The page plan moved into Keywords → Page mapping (design: Keywords tab page mapping). */
export default async function CustomerPagesRedirect({ searchParams }: Props) {
  const { site } = await searchParams;
  redirect(`/my/keywords?${site ? `site=${encodeURIComponent(site)}&` : ''}view=mapping`);
}
