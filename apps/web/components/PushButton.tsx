'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';

type PushState = 'unsupported' | 'idle' | 'subscribed' | 'denied' | 'busy';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function PushButton() {
  const [state, setState] = useState<PushState>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      if (existing) setState('subscribed');
    });
  }, []);

  const enable = async () => {
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await apiGet<{ publicKey: string }>('/v1/me/push/public-key');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
      await apiPost('/v1/me/push/subscribe', subscription.toJSON());
      setState('subscribed');
    } catch {
      setState('idle');
    }
  };

  if (state === 'unsupported') return null;
  if (state === 'subscribed') {
    return (
      <div className="chip" style={{ borderColor: 'var(--good)', color: 'var(--good)' }}>
        ● Notifications on — streaks are safe
      </div>
    );
  }
  if (state === 'denied') {
    return <div className="chip">Notifications blocked in browser settings</div>;
  }
  return (
    <button type="button" className="btn" onClick={enable} disabled={state === 'busy'}>
      🔔 Enable streak notifications
    </button>
  );
}
