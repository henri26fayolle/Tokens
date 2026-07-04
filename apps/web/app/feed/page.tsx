'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Crest } from '../../components/Crest';
import { PostCard } from '../../components/PostCard';
import { TabBar } from '../../components/TabBar';
import { apiGet, type FeedPost } from '../../lib/api';
import { useSession } from '../../lib/session';

export default function FeedPage() {
  const { loading, user } = useSession();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    apiGet<{ posts: FeedPost[] }>('/v1/feed')
      .then((feed) => setPosts(feed.posts))
      .catch(() => setPosts([]));
  }, []);

  return (
    <main className="container">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        <Crest size={24} /> Kaiden
        {!loading && !user && (
          <Link href="/login" className="btn btn-ghost" style={{ marginLeft: 'auto' }}>
            Sign in
          </Link>
        )}
      </header>

      {posts === null && <p className="muted">Loading the feed…</p>}

      {posts !== null && posts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Crest size={48} />
          </div>
          <strong>Nothing here yet.</strong>
          <p className="muted" style={{ fontSize: 14 }}>
            The first waza is waiting to be posted.
          </p>
          {user && (
            <Link href="/post/new" className="btn btn-primary" style={{ marginTop: 8 }}>
              Share what you built
            </Link>
          )}
        </div>
      )}

      {posts?.map((post) => (
        <PostCard key={post.id} post={post} loggedIn={Boolean(user)} />
      ))}

      <TabBar />
    </main>
  );
}
