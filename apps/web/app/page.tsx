'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '../lib/session';

export default function Landing() {
  const { loading, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/home');
  }, [loading, user, router]);

  return (
    <main
      className="container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingBottom: 40,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <p style={{ fontSize: 64, margin: 0 }} aria-hidden>
          皆伝
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 6px', letterSpacing: 0.3 }}>
          Kaiden
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          Strava for AI users. Route your AI usage through Kaiden,
          <br />
          earn XP, climb from 9-kyū toward 皆伝.
        </p>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <Link href="/signup" className="btn btn-primary">
            Start the climb
          </Link>
          <Link href="/login" className="btn">
            Sign in
          </Link>
        </div>
      </div>

      <p className="faint" style={{ textAlign: 'center', fontSize: 12, lineHeight: 1.6 }}>
        Metadata only — Kaiden never stores your prompts or responses,
        <br />
        and your provider API keys never touch our servers.
      </p>
    </main>
  );
}
