'use client';

import { useState } from 'react';

/**
 * A <details> that opens or closes only when the person clicks it. `defaultOpen` sets the first state;
 * a later change (after saving a form inside, say) does not fold it away under the person's hands.
 */
export function Fold({ defaultOpen, children, ...props }: { defaultOpen: boolean; children: React.ReactNode } & Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, 'open' | 'onToggle'>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details {...props} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      {children}
    </details>
  );
}
