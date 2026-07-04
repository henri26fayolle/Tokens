'use client';

import { useEffect } from 'react';

export function RegisterSw() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* sw is progressive enhancement */
      });
    }
  }, []);
  return null;
}
