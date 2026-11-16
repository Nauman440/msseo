'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { TonePill } from '@/components/ui/Pills';

/**
 * Placeholder while AI recommendations are still being written: the report is shown
 * first, and this refreshes the page once the plan has been saved.
 */
export function AiPendingCard({ auditId }: { auditId: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/audits/${auditId}/status`, { cache: 'no-store' });
        if (res.ok && !((await res.json()) as { aiPending?: boolean }).aiPending) {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // transient network error: keep polling
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [auditId, router]);

  return (
    <Card title="AI recommendations" badge={<TonePill tone="primary">AI-assessed</TonePill>}>
      <p className="flex items-center gap-3 text-[15px] text-ink-2" aria-live="polite">
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
        Writing your step-by-step fix plan. It appears here in about 30 seconds.
      </p>
    </Card>
  );
}
