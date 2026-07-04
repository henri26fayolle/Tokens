'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function SignupPage() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name: handle,
          handle: handle.toLowerCase(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `signup failed (${response.status})`);
      }
      router.push('/connect');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'signup failed');
      setBusy(false);
    }
  };

  return (
    <main className="container" style={{ paddingTop: 56 }}>
      <p style={{ fontSize: 40, margin: '0 0 4px' }} aria-hidden>
        皆伝
      </p>
      <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Claim your handle</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Every journey starts at 9-kyū.
      </p>
      <form onSubmit={submit} className="card">
        <input
          className="input"
          placeholder="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
          minLength={2}
          maxLength={24}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="muted" style={{ textAlign: 'center', fontSize: 14 }}>
        Already climbing?{' '}
        <Link href="/login" style={{ color: 'var(--accent)' }}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
