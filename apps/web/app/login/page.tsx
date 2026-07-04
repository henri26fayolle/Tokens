'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Crest } from '../../components/Crest';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'invalid email or password');
      }
      router.push('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign-in failed');
      setBusy(false);
    }
  };

  return (
    <main className="container" style={{ paddingTop: 56 }}>
      <Crest size={52} />
      <h1 style={{ fontSize: 24, margin: '14px 0 16px' }}>Welcome back</h1>
      <form onSubmit={submit} className="card">
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
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="muted" style={{ textAlign: 'center', fontSize: 14 }}>
        New here?{' '}
        <Link href="/signup" style={{ color: 'var(--accent)' }}>
          Start the climb
        </Link>
      </p>
    </main>
  );
}
