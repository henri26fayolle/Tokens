import type { XpConfig } from '@kaiden/xp-config';
import { localDayOf } from './localday';
import { computeDay } from './rules';
import type { DayState, EngineEvent, UserComputation } from './types';

export interface ComputeUserInput {
  userId: string;
  /** Must be valid (caller falls back to UTC — see processor). */
  timezone: string;
  /** Any order; the engine sorts by (ts, id) for determinism. */
  events: EngineEvent[];
}

/**
 * Full deterministic replay: every derived fact (streaks, firsts,
 * achievements) is recomputed from the event log alone, so the same events
 * always produce the identical ledger — the M2 DoD property. The processor
 * persists proposals idempotently; re-running is always safe.
 *
 * O(events) per run. If full replay ever gets slow, checkpoint via
 * daily_activity — but keep a replay path forever; it's the audit story.
 */
export function computeUser(input: ComputeUserInput, config: XpConfig): UserComputation {
  const sorted = [...input.events].sort((a, b) => a.ts.getTime() - b.ts.getTime() || a.id - b.id);

  const byDay = new Map<string, EngineEvent[]>();
  for (const event of sorted) {
    const day = localDayOf(event.ts, input.timezone);
    const bucket = byDay.get(day);
    if (bucket) {
      bucket.push(event);
    } else {
      byDay.set(day, [event]);
    }
  }
  const days = [...byDay.keys()].sort();

  const result: UserComputation = {
    ledger: [],
    achievements: [],
    days: [],
    moments: [],
    lastActiveDay: null,
    currentStreak: 0,
    longestStreak: 0,
    lifetimeXp: 0,
  };

  const knownProviders = new Set<string>();
  const knownModels = new Set<string>();
  const grantedAchievements = new Set<string>();
  let neverConnected = true;
  let priorStreak = 0;
  let lastActiveDay: string | null = null;

  for (const day of days) {
    const events = byDay.get(day) ?? [];
    const state: DayState = {
      userId: input.userId,
      timezone: input.timezone,
      priorStreak,
      lastActiveDay,
      neverConnected,
      knownProviders,
      knownModels,
      grantedAchievements,
    };
    const computed = computeDay(day, events, state, config);

    result.ledger.push(...computed.ledger);
    result.achievements.push(...computed.achievements);
    result.days.push(computed.aggregate);
    result.moments.push(...computed.moments);
    result.longestStreak = Math.max(result.longestStreak, computed.streak);

    for (const provider of computed.aggregate.providers) knownProviders.add(provider);
    for (const model of computed.aggregate.models) knownModels.add(model);
    for (const id of computed.achievements) grantedAchievements.add(id);
    neverConnected = false;
    priorStreak = computed.streak;
    lastActiveDay = day;
  }

  result.lastActiveDay = lastActiveDay;
  result.currentStreak = priorStreak;
  result.lifetimeXp = result.ledger.reduce((sum, row) => sum + row.amount, 0);
  return result;
}
