import { redirect } from 'next/navigation';
import { normDomain } from '@seo/core';

type Props = { params: Promise<{ domain: string }> };

/** The page plan moved into Keywords → Page mapping (design: Keywords tab page mapping). */
export default async function TeamMappingRedirect({ params }: Props) {
  const domain = normDomain(decodeURIComponent((await params).domain));
  redirect(`/keywords/${encodeURIComponent(domain)}?view=mapping`);
}
