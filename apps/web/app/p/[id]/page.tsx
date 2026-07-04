'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { CloseIcon } from '../../../components/icons';
import { PostCard } from '../../../components/PostCard';
import { TabBar } from '../../../components/TabBar';
import { apiDelete, apiGet, apiPost, type CommentItem, type FeedPost } from '../../../lib/api';
import { useSession } from '../../../lib/session';

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export default function PostPage() {
  const params = useParams<{ id: string }>();
  const { user } = useSession();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [missing, setMissing] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!params.id) return;
    try {
      const [postData, commentData] = await Promise.all([
        apiGet<FeedPost>(`/v1/posts/${params.id}`),
        apiGet<{ comments: CommentItem[] }>(`/v1/posts/${params.id}/comments`),
      ]);
      setPost(postData);
      setComments(commentData.comments);
    } catch {
      setMissing(true);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/v1/posts/${params.id}/comments`, { body: draft.trim() });
      setDraft('');
      await load();
    } catch {
      /* rate limit or session expiry — keep the draft */
    } finally {
      setBusy(false);
    }
  };

  const remove = async (commentId: string) => {
    await apiDelete(`/v1/comments/${commentId}`).catch(() => null);
    await load();
  };

  if (missing) {
    return (
      <main className="container" style={{ paddingTop: 120, textAlign: 'center' }}>
        <p className="muted">This waza is gone.</p>
        <TabBar />
      </main>
    );
  }

  if (!post) {
    return (
      <main className="container" style={{ paddingTop: 120, textAlign: 'center' }}>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const canModerate = user?.handle === post.author.handle;

  return (
    <main className="container">
      <PostCard post={post} loggedIn={Boolean(user)} linkComments={false} />

      <section className="card">
        <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Comments · {comments.length}
        </div>

        {comments.length === 0 && (
          <p className="faint" style={{ fontSize: 14 }}>
            No comments yet — ask how it was built.
          </p>
        )}

        {comments.map((comment) => (
          <div key={comment.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Link href={`/u/${comment.author.handle}`} style={{ fontWeight: 700 }}>
                @{comment.author.handle}
              </Link>
              <span className="chip">{comment.author.rank}</span>
              <span className="faint" style={{ marginLeft: 'auto' }}>
                {timeAgo(comment.createdAt)}
              </span>
              {(canModerate || user?.handle === comment.author.handle) && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: 'var(--ink-3)', padding: '2px 6px' }}
                  onClick={() => remove(comment.id)}
                  aria-label="Delete comment"
                >
                  <CloseIcon size={16} />
                </button>
              )}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: '6px 0 0' }}>{comment.body}</p>
          </div>
        ))}

        {user ? (
          <form onSubmit={submit} style={{ marginTop: 14 }}>
            <textarea
              className="input"
              placeholder="Say something useful…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
              {busy ? 'Posting…' : 'Comment'}
            </button>
          </form>
        ) : (
          <Link href="/login" className="btn" style={{ marginTop: 14 }}>
            Sign in to join the conversation
          </Link>
        )}
      </section>

      <TabBar />
    </main>
  );
}
