'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ActivityChart } from '../../components/ActivityChart';
import { Crest } from '../../components/Crest';
import { PushButton } from '../../components/PushButton';
import { ShareCardButton } from '../../components/ShareCardButton';
import { TabBar } from '../../components/TabBar';
import { WrappedButton } from '../../components/WrappedButton';
import {
  type AchievementItem,
  apiGet,
  apiPost,
  type Onboarding,
  type Profile,
  type StatsDay,
} from '../../lib/api';
import { signOut, useSession } from '../../lib/session';

export default function HomePage() {
  const { loading, user } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<StatsDay[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Fresh XP on open (idempotent), then load everything.
      await apiPost('/v1/me/xp/process').catch(() => null);
      const [profileData, statsData, achievementsData, onboardingData] = await Promise.all([
        apiGet<Profile>('/v1/me/profile'),
        apiGet<{ days: StatsDay[] }>('/v1/me/stats?days=14'),
        apiGet<{ achievements: AchievementItem[] }>('/v1/me/achievements'),
        apiGet<Onboarding>('/v1/me/onboarding'),
      ]);
      setProfile(profileData);
      setStats(statsData.days);
      setAchievements(achievementsData.achievements);
      setOnboarding(onboardingData);
    })().catch(() => null);
  }, [user]);

  if (loading || !user || !profile) {
    return (
      <main className="container" style={{ paddingTop: 120, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Crest size={56} />
        </div>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const progressPct = Math.min(
    100,
    Math.round((profile.progress.intoLevel / Math.max(1, profile.progress.neededForNext)) * 100),
  );
  const isDan = profile.rank.includes('dan');
  const earned = achievements.filter((a) => a.grantedAt !== null);

  return (
    <main className="container">
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18 }}
        >
          <Crest size={24} /> Kaiden
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => signOut().then(() => router.replace('/'))}
        >
          Sign out
        </button>
      </header>

      {onboarding && !onboarding.connected && (
        <Link href="/connect">
          <div
            className="card"
            style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
          >
            <strong>Finish setup →</strong>
            <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              Point your AI SDK at the Kaiden gateway to earn your first XP.
            </div>
          </div>
        </Link>
      )}

      <section className="card" style={{ textAlign: 'center', paddingTop: 26 }}>
        <div className="muted" style={{ fontSize: 14 }}>
          @{profile.handle}
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            letterSpacing: 1,
            margin: '6px 0 2px',
            color: isDan ? 'var(--gold)' : 'var(--ink)',
          }}
        >
          {profile.rank}
        </div>
        <div className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
          Level {profile.level} · {Intl.NumberFormat().format(profile.lifetimeXp)} XP lifetime
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            marginBottom: 8,
          }}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, var(--accent), #f08a6f)',
              transition: 'width .6s ease',
            }}
          />
        </div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 18 }}>
          {profile.progress.intoLevel} / {profile.progress.neededForNext} XP to level{' '}
          {profile.level + 1}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 26, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {profile.currentStreak > 0 ? `🔥 ${profile.currentStreak}` : '—'}
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              day streak
            </div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{profile.longestStreak}</div>
            <div className="faint" style={{ fontSize: 12 }}>
              best streak
            </div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {Intl.NumberFormat().format(profile.seasonXp)}
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              {profile.seasonId} XP
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <ActivityChart days={stats} />
      </section>

      <section className="card">
        <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Achievements · {earned.length}/{achievements.length}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                opacity: achievement.grantedAt ? 1 : 0.4,
                background: achievement.grantedAt ? 'var(--surface-2)' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{achievement.name}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {achievement.description}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ShareCardButton profile={profile} />
        {(onboarding?.connected ?? false) && <WrappedButton handle={profile.handle} />}
        <PushButton />
      </div>

      <TabBar />
    </main>
  );
}
