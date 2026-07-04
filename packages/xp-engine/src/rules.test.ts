import { XP_CONFIG } from '@kaiden/xp-config';
import { describe, expect, it } from 'vitest';
import { computeUser } from './engine';
import { addDays, diffDays, localDayOf, localHourOf } from './localday';
import { streakBonusFor, usageXpFor } from './rules';
import type { EngineEvent } from './types';

const USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

let nextId = 1;
function event(ts: Date, partial: Partial<EngineEvent> = {}): EngineEvent {
  return {
    id: nextId++,
    ts,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    promptTokens: 100,
    completionTokens: 100,
    toolUse: false,
    sessionHint: null,
    ...partial,
  };
}

describe('local day math', () => {
  it('maps UTC timestamps into the user’s local day', () => {
    const ts = new Date('2026-07-04T05:30:00Z');
    expect(localDayOf(ts, 'America/Los_Angeles')).toBe('2026-07-03');
    expect(localDayOf(ts, 'Asia/Tokyo')).toBe('2026-07-04');
    expect(localHourOf(ts, 'America/Los_Angeles')).toBe(22);
  });

  it('adds and diffs days across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-02-01', '2026-01-31')).toBe(1);
    expect(diffDays('2026-01-16', '2026-01-01')).toBe(15);
  });
});

describe('curves', () => {
  it('usage XP is zero at zero, monotonic, and capped', () => {
    expect(usageXpFor(0, XP_CONFIG)).toBe(0);
    let previous = 0;
    for (const tokens of [100, 1_000, 10_000, 100_000, 1_000_000, 100_000_000]) {
      const xp = usageXpFor(tokens, XP_CONFIG);
      expect(xp).toBeGreaterThanOrEqual(previous);
      previous = xp;
    }
    expect(usageXpFor(100_000_000, XP_CONFIG)).toBe(XP_CONFIG.daily.usageXpDailyCap);
  });

  it('streak bonus is 2× streak, capped at 60', () => {
    expect(streakBonusFor(1, XP_CONFIG)).toBe(2);
    expect(streakBonusFor(30, XP_CONFIG)).toBe(60);
    expect(streakBonusFor(300, XP_CONFIG)).toBe(60);
  });
});

describe('streaks', () => {
  it('increments on consecutive local days and resets after a gap', () => {
    const result = computeUser(
      {
        userId: USER,
        timezone: 'UTC',
        events: [
          event(new Date('2026-07-01T10:00:00Z')),
          event(new Date('2026-07-02T10:00:00Z')),
          event(new Date('2026-07-04T10:00:00Z')),
        ],
      },
      XP_CONFIG,
    );
    const streakRows = result.ledger.filter((row) => row.ruleId === 'streak');
    expect(streakRows.map((row) => row.amount)).toEqual([2, 4, 2]);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(2);
  });

  it('two UTC timestamps around a local midnight land on two local days', () => {
    const result = computeUser(
      {
        userId: USER,
        timezone: 'America/Los_Angeles',
        events: [
          event(new Date('2026-07-04T05:30:00Z')), // Jul 3, 22:30 local
          event(new Date('2026-07-04T08:00:00Z')), // Jul 4, 01:00 local
        ],
      },
      XP_CONFIG,
    );
    expect(result.days.map((d) => d.day)).toEqual(['2026-07-03', '2026-07-04']);
    expect(result.currentStreak).toBe(2);
    // 01:00 local is a night-shift session.
    expect(result.achievements).toContain('night-shift');
  });
});

describe('behavior bonuses', () => {
  it('rewards firsts exactly once, ever', () => {
    const result = computeUser(
      {
        userId: USER,
        timezone: 'UTC',
        events: [
          event(new Date('2026-07-01T10:00:00Z')),
          event(new Date('2026-07-02T10:00:00Z')),
          event(new Date('2026-07-02T11:00:00Z'), { provider: 'openai', model: 'gpt-5.2' }),
        ],
      },
      XP_CONFIG,
    );
    expect(result.ledger.filter((row) => row.ruleId === 'connected')).toHaveLength(1);
    expect(result.ledger.filter((row) => row.ruleId === 'first-provider')).toHaveLength(2);
    expect(result.ledger.filter((row) => row.ruleId === 'first-model')).toHaveLength(2);
    // Day 2 had two providers; day 1 only one.
    expect(result.ledger.filter((row) => row.ruleId === 'multi-provider-day')).toHaveLength(1);
  });

  it('deep sessions need a shared session hint', () => {
    const hinted = Array.from({ length: 12 }, (_, i) =>
      event(new Date(Date.UTC(2026, 6, 1, 10, i)), { sessionHint: 'work' }),
    );
    const unhinted = Array.from({ length: 12 }, (_, i) =>
      event(new Date(Date.UTC(2026, 6, 2, 10, i))),
    );
    const result = computeUser(
      { userId: USER, timezone: 'UTC', events: [...hinted, ...unhinted] },
      XP_CONFIG,
    );
    const deepDays = result.ledger.filter((row) => row.ruleId === 'deep-session-day');
    expect(deepDays).toHaveLength(1);
    expect(deepDays[0]?.day).toBe('2026-07-01');
  });
});

describe('achievements', () => {
  it('polyglot needs three providers in one day, and is granted once', () => {
    const day = (d: number, provider: string) =>
      event(new Date(Date.UTC(2026, 6, d, 12)), { provider, model: 'm' });
    const result = computeUser(
      {
        userId: USER,
        timezone: 'UTC',
        events: [
          day(1, 'anthropic'),
          day(1, 'openai'),
          day(1, 'mistral'),
          day(2, 'anthropic'),
          day(2, 'openai'),
          day(2, 'mistral'),
        ],
      },
      XP_CONFIG,
    );
    expect(result.achievements.filter((id) => id === 'polyglot')).toHaveLength(1);
  });

  it('comeback triggers at 15+ days between active days, not 14', () => {
    const at = (day: string) => event(new Date(`${day}T12:00:00Z`));
    const short = computeUser(
      { userId: USER, timezone: 'UTC', events: [at('2026-01-01'), at('2026-01-15')] },
      XP_CONFIG,
    );
    expect(short.achievements).not.toContain('comeback');
    const long = computeUser(
      { userId: USER, timezone: 'UTC', events: [at('2026-01-01'), at('2026-01-16')] },
      XP_CONFIG,
    );
    expect(long.achievements).toContain('comeback');
  });

  it('marathon needs a 25-turn thread', () => {
    const events = Array.from({ length: 25 }, (_, i) =>
      event(new Date(Date.UTC(2026, 6, 1, 9, i)), { sessionHint: 'epic' }),
    );
    const result = computeUser({ userId: USER, timezone: 'UTC', events }, XP_CONFIG);
    expect(result.achievements).toContain('marathon');
  });
});
