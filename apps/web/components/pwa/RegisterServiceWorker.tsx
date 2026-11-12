'use client';

import { useEffect } from 'react';

/** Registers /sw.js in production builds only, so dev hot reload is never cached. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Registration failure only disables offline support; the app keeps working.
    });
  }, []);
  return null;
}
