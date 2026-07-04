'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SessionUser } from './api';

interface SessionState {
  loading: boolean;
  user: SessionUser | null;
}

/** better-auth session probe; null user = logged out (or api unreachable). */
export function useSession(): SessionState & { refresh: () => void } {
  const [state, setState] = useState<SessionState>({ loading: true, user: null });

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth/get-session', { credentials: 'include' });
        const body = response.ok ? await response.json() : null;
        const user =
          body && typeof body === 'object' && 'user' in body
            ? ((body as { user: SessionUser | null }).user ?? null)
            : null;
        if (!cancelled) setState({ loading: false, user });
      } catch {
        if (!cancelled) setState({ loading: false, user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  return { ...state, refresh };
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}
