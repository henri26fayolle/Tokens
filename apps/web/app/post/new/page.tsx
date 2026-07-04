'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';
import { TabBar } from '../../../components/TabBar';
import { ApiError, apiGet, apiPost, type MomentSuggestion } from '../../../lib/api';
import { useSession } from '../../../lib/session';

function Composer() {
  const { loading, user } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const momentParam = searchParams.get('moment');

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [recipe, setRecipe] = useState('');
  const [momentId, setMomentId] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Prefill from a detected moment (gateway-drafted post).
  useEffect(() => {
    if (!user || !momentParam) return;
    apiGet<{ suggestions: MomentSuggestion[] }>('/v1/me/moments/suggestions')
      .then(({ suggestions }) => {
        const match = suggestions.find((s) => s.momentId === momentParam);
        if (match) {
          setTitle(match.draft.title);
          setBody(match.draft.body);
          setMomentId(match.momentId);
          setPrefilled(true);
        }
      })
      .catch(() => null);
  }, [user, momentParam]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost('/v1/posts', {
        title,
        body,
        url: url || undefined,
        recipe: recipe || undefined,
        momentId: momentId || undefined,
      });
      router.push('/feed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'post failed');
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <h1 style={{ fontSize: 22, margin: '4px 0 2px' }}>Share what you built</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        {prefilled
          ? 'Drafted from your session — tweak it, add a link, post. Your verified chips are attached.'
          : 'Your verified chips — rank, streak, models — attach automatically. +100 XP.'}
      </p>
      <form onSubmit={submit} className="card">
        <input
          className="input"
          placeholder="What is it? (title)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          required
        />
        <input
          className="input"
          type="url"
          placeholder="Link (optional — your app, demo, repo)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={500}
        />
        <textarea
          className="input"
          placeholder="The story in a couple of sentences"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={3}
          required
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
        <textarea
          className="input"
          placeholder="The recipe (optional) — the prompt, the stack, the starting point. Others can copy it, and you earn XP when they do."
          value={recipe}
          onChange={(e) => setRecipe(e.target.value)}
          maxLength={4000}
          rows={5}
          style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Posting…' : 'Post it'}
        </button>
      </form>
      <TabBar />
    </main>
  );
}

export default function NewPostPage() {
  return (
    <Suspense
      fallback={
        <main className="container" style={{ paddingTop: 120, textAlign: 'center' }}>
          <p className="muted">Loading…</p>
        </main>
      }
    >
      <Composer />
    </Suspense>
  );
}
