'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiDelete, apiPost, type FeedPost } from '../lib/api';

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function PostCard({
  post,
  loggedIn,
  showAuthor = true,
  linkComments = true,
}: {
  post: FeedPost;
  loggedIn: boolean;
  showAuthor?: boolean;
  linkComments?: boolean;
}) {
  const [kudos, setKudos] = useState(post.myKudos);
  const [kudosCount, setKudosCount] = useState(post.kudosCount);
  const [copied, setCopied] = useState(false);

  const toggleKudos = async () => {
    if (!loggedIn) {
      window.location.href = '/login';
      return;
    }
    try {
      const result = kudos
        ? await apiDelete<{ kudosCount: number }>(`/v1/posts/${post.id}/kudos`)
        : await apiPost<{ kudosCount: number }>(`/v1/posts/${post.id}/kudos`);
      setKudos(!kudos);
      setKudosCount(result.kudosCount);
    } catch {
      /* self-kudos or logged-out race — leave state as is */
    }
  };

  const copyRecipe = async () => {
    if (!post.recipe) return;
    await navigator.clipboard.writeText(post.recipe);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    if (loggedIn) apiPost(`/v1/posts/${post.id}/copy`).catch(() => null);
  };

  const models = (post.chips.models ?? []).map((model) => model.split('/')[1] ?? model);

  return (
    <article className="card">
      {showAuthor && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          <Link href={`/u/${post.author.handle}`} style={{ fontWeight: 700 }}>
            @{post.author.handle}
          </Link>
          <span className="chip">{post.author.rank}</span>
          <span className="faint" style={{ marginLeft: 'auto' }}>
            {timeAgo(post.createdAt)}
          </span>
        </div>
      )}
      <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>{post.title}</h2>
      {post.url && (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}
        >
          {domainOf(post.url)} ↗
        </a>
      )}
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, margin: '8px 0 12px' }}>
        {post.body}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {typeof post.chips.streak === 'number' && post.chips.streak > 0 && (
          <span className="chip">🔥 {post.chips.streak}-day streak</span>
        )}
        {models.map((model) => (
          <span key={model} className="chip">
            {model}
          </span>
        ))}
        {post.chips.moment && typeof post.chips.moment.turns === 'number' && (
          <span className="chip">{String(post.chips.moment.turns)} turns</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn"
          style={{
            width: 'auto',
            padding: '8px 14px',
            ...(kudos ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}),
          }}
          onClick={toggleKudos}
        >
          {kudos ? '❤️' : '🤍'} {kudosCount}
        </button>
        {linkComments && (
          <Link
            href={`/p/${post.id}`}
            className="btn"
            style={{ width: 'auto', padding: '8px 14px' }}
          >
            💬 {post.commentCount}
          </Link>
        )}
        {post.recipe && (
          <button
            type="button"
            className="btn"
            style={{ width: 'auto', padding: '8px 14px' }}
            onClick={copyRecipe}
          >
            {copied ? '✓ Recipe copied' : `📋 Copy recipe · ${post.copyCount}`}
          </button>
        )}
      </div>
    </article>
  );
}
