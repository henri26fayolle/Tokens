import { XP_CONFIG } from '@kaiden/xp-config';
import { describe, expect, it } from 'vitest';
import { computeUser } from './engine';
import { levelForXp } from './levels';
import { computeDay } from './rules';
import type { DayState, EngineEvent, LedgerProposal } from './types';

/**
 * M2 definition-of-done simulations (docs/build-plan.md):
 *  - a bot hammering requests earns ≤ the daily cap,
 *  - a genuine enthusiast month lands in the brief's level 8–9 band,
 *  - replaying produces identical ledgers.
 */

const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** One-time rules excluded when checking the *recurring* daily ceiling. */
const ONE_TIME_RULES = new Set(['connected', 'first-provider', 'first-model', 'achievement']);

let nextId = 1;
function event(partial: Partial<EngineEvent> & { ts: Date }): EngineEvent {
  return {
    id: nextId++,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    promptTokens: 500,
    completionTokens: 500,
    toolUse: false,
    sessionHint: null,
    ...partial,
  };
}

function dailyTotals(ledger: LedgerProposal[], excludeOneTime: boolean): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of ledger) {
    if (excludeOneTime && ONE_TIME_RULES.has(row.ruleId)) continue;
    totals.set(row.day, (totals.get(row.day) ?? 0) + row.amount);
  }
  return totals;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('bot ceiling', () => {
  it('a token-farming bot tops out at the ~150/day recurring cap', () => {
    const events: EngineEvent[] = [];
    for (let day = 0; day < 35; day += 1) {
      for (let i = 0; i < 50; i += 1) {
        events.push(
          event({
            ts: new Date(Date.UTC(2026, 5, 1 + day, 10, i)),
            promptTokens: 100_000,
            completionTokens: 100_000,
          }),
        );
      }
    }
    const result = computeUser({ userId: USER, timezone: 'UTC', events }, XP_CONFIG);
    const recurring = dailyTotals(result.ledger, true);

    for (const [, total] of recurring) {
      expect(total).toBeLessThanOrEqual(150);
    }
    // Steady state (streak bonus maxed): exactly active 30 + usage 60 + streak 60.
    expect(recurring.get('2026-07-04')).toBe(150);
    expect(recurring.get('2026-07-05')).toBe(150);
    // No behavior bonuses ever fired: no tools, no sessions, one provider.
    expect(result.ledger.some((row) => row.ruleId === 'tool-use-day')).toBe(false);
    expect(result.ledger.some((row) => row.ruleId === 'deep-session-day')).toBe(false);
    expect(result.ledger.some((row) => row.ruleId === 'multi-provider-day')).toBe(false);
  });
});

describe('enthusiast month', () => {
  it('a genuine month of breadth lands in the brief’s level 8–9 band', () => {
    const events: EngineEvent[] = [];
    for (let day = 0; day < 30; day += 1) {
      const date = (hour: number, minute: number) =>
        new Date(Date.UTC(2026, 5, 1 + day, hour, minute));
      for (let i = 0; i < 20; i += 1) {
        events.push(
          event({
            ts: date(9, i),
            provider: 'anthropic',
            model: day >= 14 ? (i % 2 ? 'claude-haiku-5' : 'claude-sonnet-5') : 'claude-sonnet-5',
            promptTokens: 625,
            completionTokens: 625,
            toolUse: i < 3,
            sessionHint: i < (day === 9 ? 26 : 12) ? `deep-${day}` : null,
          }),
        );
      }
      for (let i = 0; i < 20; i += 1) {
        events.push(
          event({
            ts: date(15, i),
            provider: 'openai',
            model: day >= 19 ? (i % 2 ? 'gpt-5.2-mini' : 'gpt-5.2') : 'gpt-5.2',
            promptTokens: 625,
            completionTokens: 625,
            sessionHint: day === 9 && i < 6 ? 'deep-9' : null,
          }),
        );
      }
      if (day === 4) {
        // 00:30 UTC = 02:30 in Paris — a night-shift session.
        events.push(event({ ts: new Date(Date.UTC(2026, 5, 5, 0, 30)) }));
      }
    }

    const result = computeUser({ userId: USER, timezone: 'Europe/Paris', events }, XP_CONFIG);
    const level = levelForXp(result.lifetimeXp, XP_CONFIG);

    expect(level).toBeGreaterThanOrEqual(8);
    expect(level).toBeLessThanOrEqual(9);
    expect(result.achievements).toContain('marathon');
    expect(result.achievements).toContain('night-shift');
    expect(result.currentStreak).toBe(30);
    // Whale check: an enthusiast should earn well beyond bot ceiling overall.
    expect(result.lifetimeXp).toBeGreaterThan(35 * 150);
  });
});

describe('determinism and replay', () => {
  function randomEvents(seed: number): EngineEvent[] {
    const random = mulberry32(seed);
    const events: EngineEvent[] = [];
    let id = 1;
    for (let day = 0; day < 90; day += 1) {
      if (random() < 0.35) continue; // idle days, sometimes long gaps
      const count = 1 + Math.floor(random() * 30);
      for (let i = 0; i < count; i += 1) {
        events.push({
          id: id++,
          ts: new Date(Date.UTC(2026, 0, 1 + day, Math.floor(random() * 24), i)),
          provider: random() < 0.5 ? 'anthropic' : random() < 0.9 ? 'openai' : 'mistral',
          model: `model-${Math.floor(random() * 5)}`,
          promptTokens: Math.floor(random() * 40_000),
          completionTokens: Math.floor(random() * 8_000),
          toolUse: random() < 0.3,
          sessionHint: random() < 0.5 ? `s${day}-${Math.floor(random() * 3)}` : null,
        });
      }
    }
    return events;
  }

  it('replaying the same events produces the identical ledger', () => {
    for (const seed of [3, 11, 2026]) {
      const events = randomEvents(seed);
      const first = computeUser({ userId: USER, timezone: 'Asia/Tokyo', events }, XP_CONFIG);
      const second = computeUser(
        { userId: USER, timezone: 'Asia/Tokyo', events: [...events].reverse() },
        XP_CONFIG,
      );
      expect(second.ledger).toEqual(first.ledger);
      expect(second.achievements).toEqual(first.achievements);
      expect(second.moments).toEqual(first.moments);
      expect(second.lifetimeXp).toBe(first.lifetimeXp);
    }
  });

  it('mid-day checkpoints emit a prefix-compatible subset (safe with ON CONFLICT)', () => {
    const random = mulberry32(7);
    const day = '2026-03-10';
    const events: EngineEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      events.push(
        event({
          ts: new Date(Date.UTC(2026, 2, 10, 8, i)),
          provider: i % 3 ? 'anthropic' : 'openai',
          promptTokens: Math.floor(random() * 20_000),
          toolUse: i > 25,
          sessionHint: i % 2 ? 'chat' : null,
        }),
      );
    }
    const state: DayState = {
      userId: USER,
      timezone: 'UTC',
      priorStreak: 4,
      lastActiveDay: '2026-03-09',
      neverConnected: false,
      knownProviders: new Set(['anthropic']),
      knownModels: new Set(['anthropic/claude-sonnet-5']),
      grantedAchievements: new Set(),
    };
    const full = computeDay(day, events, state, XP_CONFIG);
    const fullByKey = new Map(full.ledger.map((row) => [row.idempotencyKey, row]));

    for (const cut of [1, 7, 19, 33]) {
      const partial = computeDay(day, events.slice(0, cut), state, XP_CONFIG);
      for (const row of partial.ledger) {
        const finalRow = fullByKey.get(row.idempotencyKey);
        expect(finalRow, `key ${row.idempotencyKey} missing from full replay`).toBeDefined();
        expect(finalRow?.amount).toBe(row.amount);
        expect(finalRow?.ruleId).toBe(row.ruleId);
      }
    }
  });
});

describe('first session', () => {
  it('a realistic single-provider first session reaches level 2 (brief §7 target)', () => {
    const events: EngineEvent[] = [];
    for (let i = 0; i < 15; i += 1) {
      events.push(
        event({
          ts: new Date(Date.UTC(2026, 6, 4, 14, i * 3)),
          promptTokens: 900,
          completionTokens: 433,
          toolUse: i > 8,
          sessionHint: 'first-session',
        }),
      );
    }
    const result = computeUser({ userId: USER, timezone: 'America/New_York', events }, XP_CONFIG);

    expect(result.lifetimeXp).toBeGreaterThanOrEqual(200);
    expect(levelForXp(result.lifetimeXp, XP_CONFIG)).toBe(2);
    expect(result.achievements).not.toContain('marathon');
  });
});
