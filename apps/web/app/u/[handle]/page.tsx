'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Crest } from '../../../components/Crest';
import { PostCard } from '../../../components/PostCard';
import { TabBar } from '../../../components/TabBar';
import { apiGet, type PublicProfile } from '../../../lib/api';
import { useSession } from '../../../lib/session';

export default function PublicProfilePage() {
  const params = useParams<{ handle: string }>();
  const { user } = useSession();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params.handle) return;
    apiGet<PublicProfile>(`/v1/users/${params.handle}`)
      .then(setProfile)
      .catch(() => setMissing(true));
  }, [params.handle]);

  if (missing) {
    return (
      <main className="container" style={{ paddingTop: 120, textAlign: 'center' }}>
        <p className="muted">No one climbs under that name.</p>
        <TabBar />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="container" style={{ paddingTop: 120, textAlign: 'center' }}>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const isDan = profile.rank.includes('dan');

  return (
    <main className="container">
      <section className="card" style={{ textAlign: 'center', paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <Crest size={40} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>@{profile.handle}</div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 900,
            margin: '4px 0 2px',
            color: isDan ? 'var(--gold)' : 'var(--ink)',
          }}
        >
          {profile.rank}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Level {profile.level} · {Intl.NumberFormat().format(profile.lifetimeXp)} XP ·{' '}
          {profile.currentStreak > 0 ? `🔥 ${profile.currentStreak}` : '—'} streak
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          climbing since {new Date(profile.memberSince).toLocaleDateString()}
        </div>
      </section>

      {profile.posts.length > 0 ? (
        profile.posts.map((post) => (
          <PostCard key={post.id} post={post} loggedIn={Boolean(user)} showAuthor={false} />
        ))
      ) : (
        <p className="faint" style={{ textAlign: 'center', fontSize: 14 }}>
          No waza posted yet.
        </p>
      )}

      <TabBar />
    </main>
  );
}
