'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { INPUT } from '@/components/competitors/forms';
import { TOPIC_ORDERS, type TopicOrder } from './labels';

/** "Sort by" for the topic cards: kept in the address, so the server sorts. */
export function TopicSort({ value }: { value: TopicOrder }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex min-w-[180px] flex-col gap-1 text-[12px] font-bold text-ink-2">
      Sort by
      <select
        value={value}
        onChange={(e) => {
          const qs = new URLSearchParams(params.toString());
          if (e.target.value === 'priority') qs.delete('sort');
          else qs.set('sort', e.target.value);
          router.replace(`${pathname}?${qs}`, { scroll: false });
        }}
        className={`${INPUT} text-sm text-ink`}
      >
        {TOPIC_ORDERS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
