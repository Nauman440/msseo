import Image from 'next/image';
import { cn } from '@/lib/tones';

// Masters live in <repo>/logo; `pnpm --filter @seo/web icons` regenerates these files.
const RATIO = 738 / 120;

const SRC = {
  /** Dark text, for light surfaces (landing header, app footer). */
  dark: '/brand/msscore-logo.png',
  /** Light text, for navy surfaces (app header, landing footer, PDF cover). */
  light: '/brand/msscore-logo-light.png',
};

/** MS SCORE logo ("By Morosoft Technologies" is part of the artwork). */
export function Logo({ tone = 'dark', height = 36, priority = false, className }: { tone?: 'dark' | 'light'; height?: number; priority?: boolean; className?: string }) {
  const width = Math.round(height * RATIO);
  return (
    <Image
      src={SRC[tone]}
      alt="MS SCORE by Morosoft Technologies"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={cn('h-auto max-w-none', className)}
      style={{ width, height }}
    />
  );
}
