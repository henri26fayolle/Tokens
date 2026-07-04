'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Qr } from '../../components/Qr';
import { TabBar } from '../../components/TabBar';
import { ToolGuides } from '../../components/ToolGuides';
import { apiDelete, apiGet, apiPost, type KeyItem, type Onboarding } from '../../lib/api';
import { useSession } from '../../lib/session';

export default function ConnectPage() {
  const { loading, user } = useSession();
  const router = useRouter();
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [freshKey, setFreshKey] = useState<string>('');
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const celebrated = useRef(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  const loadKeys = useCallback(async () => {
    const response = await apiGet<{ keys: KeyItem[] }>('/v1/me/keys');
    setKeys(response.keys);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadKeys().catch(() => null);
  }, [user, loadKeys]);

  // Live "first event" moment: poll until connected, then celebrate.
  useEffect(() => {
    if (!user || onboarding?.connected) return;
    const interval = setInterval(async () => {
      const status = await apiGet<Onboarding>('/v1/me/onboarding').catch(() => null);
      if (status) {
        setOnboarding(status);
        if (status.connected && !celebrated.current) {
          celebrated.current = true;
          await apiPost('/v1/me/xp/process').catch(() => null);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [user, onboarding?.connected]);

  const mint = async () => {
    const response = await apiPost<{ id: string; key: string }>('/v1/me/keys', {
      label: 'default',
    });
    setFreshKey(response.key);
    await loadKeys();
  };

  const revoke = async (id: string) => {
    await apiDelete(`/v1/me/keys/${id}`);
    await loadKeys();
  };

  if (loading || !user) {
    return (
      <main className="container" style={{ paddingTop: 120, textAlign: 'center' }}>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const activeKeys = keys.filter((key) => !key.revokedAt);

  return (
    <main className="container">
      <h1 style={{ fontSize: 22, margin: '4px 0 2px' }}>Connect your AI</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 14, lineHeight: 1.5 }}>
        Swap your SDK base URL for the Kaiden gateway. Your provider key still goes straight to the
        provider — Kaiden never sees or stores it.
      </p>

      {onboarding?.connected ? (
        <div className="card" style={{ borderColor: 'var(--good)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🎉</div>
          <strong>Connected — first XP earned.</strong>
          <div className="muted" style={{ fontSize: 14, margin: '6px 0 12px' }}>
            {onboarding.eventCount} request{onboarding.eventCount === 1 ? '' : 's'} through the
            gateway so far.
          </div>
          <Link href="/home" className="btn btn-primary">
            See your rank →
          </Link>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: 'var(--accent)',
              animation: 'pulse 1.4s infinite',
            }}
          />
          <style>{`@keyframes pulse { 50% { opacity: .25 } }`}</style>
          <span className="muted" style={{ fontSize: 14 }}>
            Waiting for your first request…
          </span>
        </div>
      )}

      <section className="card">
        <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          1 · Your Kaiden key
        </div>
        {freshKey ? (
          <div>
            <pre className="snippet" style={{ marginBottom: 8 }}>
              {freshKey}
            </pre>
            <p className="error" style={{ fontSize: 13 }}>
              Copy it now — this is the only time it's shown. Only a hash is stored.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => navigator.clipboard.writeText(freshKey)}
            >
              Copy key
            </button>
          </div>
        ) : activeKeys.length === 0 ? (
          <button type="button" className="btn btn-primary" onClick={mint}>
            Mint a gateway key
          </button>
        ) : (
          <div className="muted" style={{ fontSize: 14 }}>
            {activeKeys.length} active key{activeKeys.length === 1 ? '' : 's'} — mint another
            anytime.
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={mint}>
              Mint another key
            </button>
          </div>
        )}
        {keys.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {keys.map((key) => (
              <div
                key={key.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderTop: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{key.label ?? 'unnamed'}</span>{' '}
                  <span className="faint">
                    {key.revokedAt
                      ? '· revoked'
                      : key.lastUsedAt
                        ? `· last used ${new Date(key.lastUsedAt).toLocaleString()}`
                        : '· never used'}
                  </span>
                </div>
                {!key.revokedAt && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: '#ff8a7a' }}
                    onClick={() => revoke(key.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          2 · Pick your tool
        </div>
        <ToolGuides kaidenKey={freshKey} />
      </section>

      <section className="card" style={{ textAlign: 'center' }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          On your phone? Continue on your desktop
        </div>
        {pageUrl && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Qr text={pageUrl} />
          </div>
        )}
        <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          The gateway swap lives where your code lives.
        </p>
      </section>

      <TabBar />
    </main>
  );
}
