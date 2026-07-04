'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Crest } from '../../../components/Crest';
import { CheckIcon, FlameIcon } from '../../../components/icons';
import { PostCard } from '../../../components/PostCard';
import { TabBar } from '../../../components/TabBar';
import { apiDelete, apiGet, apiPost, type PublicProfile } from '../../../lib/api';
import { useSession } from '../../../lib/session';

export default function PublicProfilePage() {
  const params = useParams<{ handle: string }>();
  const { user } = useSession();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.handle) return;
    apiGet<PublicProfile>(`/v1/users/${params.handle}`)
      .then(setProfile)
      .catch(() => setMissing(true));
  }, [params.handle]);

  const toggleFollow = async () => {
    if (!profile) return;
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    const path = `/v1/users/${profile.handle}/follow`;
    try {
      if (profile.iFollow) {
        await apiDelete(path);
        setProfile({
          ...profile,
          iFollow: false,
          followerCount: Math.max(0, profile.followerCount - 1),
        });
      } else {
        await apiPost(path);
        setProfile({ ...profile, iFollow: true, followerCount: profile.followerCount + 1 });
      }
    } catch {
      /* ignore — leave state as is */
    } finally {
      setBusy(false);
    }
  };

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
          {profile.currentStreak > 0 ? (
            <>
              <FlameIcon size={13} style={{ display: 'inline-block', verticalAlign: '-2px' }} />{' '}
              {profile.currentStreak}
            </>
          ) : (
            '—'
          )}{' '}
          streak
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          climbing since {new Date(profile.memberSince).toLocaleDateString()}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 20,
            margin: '14px 0 4px',
            fontSize: 13,
          }}
        >
          <span>
            <strong>{Intl.NumberFormat().format(profile.followerCount)}</strong>{' '}
            <span className="faint">followers</span>
          </span>
          <span>
            <strong>{Intl.NumberFormat().format(profile.followingCount)}</strong>{' '}
            <span className="faint">following</span>
          </span>
        </div>
        {!profile.isMe && (
          <button
            type="button"
            className={profile.iFollow ? 'btn' : 'btn btn-primary'}
            style={{ marginTop: 10 }}
            onClick={toggleFollow}
            disabled={busy}
          >
            {profile.iFollow ? (
              <>
                Following <CheckIcon size={15} />
              </>
            ) : (
              'Follow'
            )}
          </button>
        )}
        {profile.isMe && (
          <Link href="/home" className="btn" style={{ marginTop: 10 }}>
            This is you — go to Stats
          </Link>
        )}
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
