'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Crest } from '../../components/Crest';
import { FlameIcon } from '../../components/icons';
import { TabBar } from '../../components/TabBar';
import { apiGet, type Leaderboard, type LeaderboardEntry } from '../../lib/api';

function Row({ entry, meijin }: { entry: LeaderboardEntry; meijin: string | null }) {
  const isMeijin = entry.position === 1 && entry.handle === meijin;
  return (
    <Link
      href={`/u/${entry.handle}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        marginBottom: 8,
        background: entry.isMe ? 'var(--accent-soft)' : 'var(--surface)',
        borderColor: entry.isMe ? 'var(--accent)' : 'var(--border)',
      }}
    >
      <div
        style={{
          width: 30,
          textAlign: 'center',
          fontWeight: 800,
          fontSize: 15,
          color: entry.position && entry.position <= 3 ? 'var(--gold)' : 'var(--ink-3)',
          flexShrink: 0,
        }}
      >
        {entry.position ?? '—'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>@{entry.handle}</span>
          {isMeijin && (
            <span
              className="chip"
              style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
              title="Season #1"
            >
              名人 Meijin
            </span>
          )}
        </div>
        <div className="faint" style={{ fontSize: 12 }}>
          {entry.rank} · Lv {entry.level}
          {entry.currentStreak > 0 && (
            <>
              {' · '}
              <FlameIcon size={12} style={{ display: 'inline-block', verticalAlign: '-2px' }} />{' '}
              {entry.currentStreak}
            </>
          )}
        </div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
        {Intl.NumberFormat().format(entry.xp)}
        <span className="faint" style={{ fontSize: 11, fontWeight: 600 }}>
          {' '}
          XP
        </span>
      </div>
    </Link>
  );
}

export default function RanksPage() {
  const [board, setBoard] = useState<'season' | 'lifetime'>('season');
  const [data, setData] = useState<Leaderboard | null>(null);

  useEffect(() => {
    setData(null);
    apiGet<Leaderboard>(`/v1/leaderboard?board=${board}`)
      .then(setData)
      .catch(() => setData(null));
  }, [board]);

  const meInTop = data?.me && data.entries.some((entry) => entry.handle === data.me?.handle);

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
        <Crest size={24} /> Ranks
      </header>

      <div className="tabs">
        <button
          type="button"
          className={board === 'season' ? 'active' : ''}
          onClick={() => setBoard('season')}
        >
          This season
        </button>
        <button
          type="button"
          className={board === 'lifetime' ? 'active' : ''}
          onClick={() => setBoard('lifetime')}
        >
          All time
        </button>
        {data && board === 'season' && (
          <span className="faint" style={{ marginLeft: 'auto', fontSize: 12, alignSelf: 'center' }}>
            {data.season}
          </span>
        )}
      </div>

      {data === null && <p className="muted">Loading the ladder…</p>}

      {data && data.entries.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Crest size={48} />
          </div>
          <strong>No one has earned XP yet.</strong>
          <p className="muted" style={{ fontSize: 14 }}>
            Connect your usage and the first name on the ladder could be yours.
          </p>
        </div>
      )}

      {data?.entries.map((entry) => (
        <Row key={entry.handle} entry={entry} meijin={data.meijin} />
      ))}

      {data?.me && !meInTop && (
        <>
          <div className="faint" style={{ textAlign: 'center', fontSize: 12, margin: '10px 0' }}>
            · · ·
          </div>
          <Row entry={data.me} meijin={data.meijin} />
        </>
      )}

      <TabBar />
    </main>
  );
}
