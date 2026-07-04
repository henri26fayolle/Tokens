import type { XpConfig } from '@kaiden/xp-config';
import { diffDays, localHourOf } from './localday';
import type { DayComputation, DayState, EngineEvent, LedgerProposal } from './types';

/**
 * Stable ledger rule ids — treat as a public contract (stats screens and the
 * M4 app group by these). Amounts all come from config, never from here.
 *
 *  active-day          30 once/day
 *  usage               1-XP threshold rows, ≤ usageXpDailyCap/day (see below)
 *  streak              2×streak (capped) once/day, OUTSIDE the usage cap
 *  connected           one-time ever: first event through the gateway
 *  first-provider      one-time per provider
 *  first-model         one-time per provider/model
 *  multi-provider-day  once/day when ≥2 providers
 *  tool-use-day        once/day when any tool-use event
 *  deep-session-day    once/day when any session ≥ deepSessionMinTurns
 *  achievement         one-time per achievement id
 *
 * WHY 1-XP usage rows: usage XP grows log-scaled *during* a day. Appending a
 * row per threshold crossed means processing at any checkpoint cadence emits
 * a prefix of the same row set a full replay emits — ledgers stay identical
 * under ON CONFLICT DO NOTHING without ever updating a row. ≤60 tiny rows
 * per user-day; compact later if it ever matters.
 */

export function usageXpFor(totalTokens: number, config: XpConfig): number {
  const { usageXpDailyCap, usageXpScale, usageXpTokenUnit } = config.daily;
  if (totalTokens <= 0) return 0;
  return Math.min(
    usageXpDailyCap,
    Math.round(usageXpScale * Math.log(1 + totalTokens / usageXpTokenUnit)),
  );
}

export function streakBonusFor(streak: number, config: XpConfig): number {
  return Math.min(config.streak.xpPerStreakDay * streak, config.streak.bonusCap);
}

/** Turn counts per session hint (events without a hint can't form a session). */
function sessionTurnCounts(events: EngineEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.sessionHint) {
      counts.set(event.sessionHint, (counts.get(event.sessionHint) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Compute one user-local day. Pure and deterministic: same events + state +
 * config → same proposals. Events must all belong to `day` (caller groups).
 * Proposing an already-persisted row is harmless — keys make it a no-op.
 */
export function computeDay(
  day: string,
  events: EngineEvent[],
  state: DayState,
  config: XpConfig,
): DayComputation {
  const ledger: LedgerProposal[] = [];
  const achievements: string[] = [];
  const key = (suffix: string) => `${state.userId}/${suffix}`;
  const add = (ruleId: string, amount: number, idempotencySuffix: string) => {
    if (amount > 0) ledger.push({ ruleId, amount, day, idempotencyKey: key(idempotencySuffix) });
  };

  if (events.length === 0) {
    return {
      ledger,
      achievements,
      streak: 0,
      aggregate: {
        day,
        requestCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        providers: [],
        models: [],
        toolUseSession: false,
        deepSession: false,
        usageXpAwarded: 0,
      },
    };
  }

  // --- aggregate the day
  const providers = new Set<string>();
  const models = new Set<string>();
  let promptTokens = 0;
  let completionTokens = 0;
  let toolUseSession = false;
  let nightEvent = false;
  for (const event of events) {
    providers.add(event.provider);
    models.add(`${event.provider}/${event.model}`);
    promptTokens += event.promptTokens ?? 0;
    completionTokens += event.completionTokens ?? 0;
    toolUseSession ||= event.toolUse;
    nightEvent ||= localHourOf(event.ts, state.timezone) < 5;
  }
  const turnCounts = sessionTurnCounts(events);
  const deepestSession = Math.max(0, ...turnCounts.values());
  const deepSession = deepestSession >= config.behavior.deepSessionMinTurns;

  // --- streak (active today by definition — events exist)
  const streak =
    state.lastActiveDay !== null && diffDays(day, state.lastActiveDay) === 1
      ? state.priorStreak + 1
      : 1;

  // --- daily engagement
  add('active-day', config.daily.activeDayXp, `active/${day}`);
  const usageXp = usageXpFor(promptTokens + completionTokens, config);
  for (let point = 1; point <= usageXp; point += 1) {
    add('usage', 1, `usage/${day}/${point}`);
  }
  add('streak', streakBonusFor(streak, config), `streak/${day}`);

  // --- one-time firsts
  if (state.neverConnected) add('connected', config.behavior.connectedXp, 'connected');
  for (const provider of providers) {
    if (!state.knownProviders.has(provider)) {
      add('first-provider', config.behavior.firstNewProviderXp, `first-provider/${provider}`);
    }
  }
  for (const model of models) {
    if (!state.knownModels.has(model)) {
      add('first-model', config.behavior.firstNewModelXp, `first-model/${model}`);
    }
  }

  // --- rate-limited behavior bonuses (max once/day each)
  if (providers.size >= 2) {
    add('multi-provider-day', config.behavior.multiProviderDayXp, `multi-provider/${day}`);
  }
  if (toolUseSession) add('tool-use-day', config.behavior.toolUseSessionXp, `tool-use/${day}`);
  if (deepSession) add('deep-session-day', config.behavior.deepSessionXp, `deep-session/${day}`);

  // --- achievements (behavioral; 'early-adopter' needs a global model-catalog
  //     table and is deliberately not evaluated until that exists)
  const grant = (id: string) => {
    if (state.grantedAchievements.has(id) || achievements.includes(id)) return;
    const definition = config.achievements.find((a) => a.id === id);
    if (!definition) return;
    achievements.push(id);
    add('achievement', definition.xp, `achievement/${id}`);
  };
  if (providers.size >= 3) grant('polyglot');
  if (nightEvent) grant('night-shift');
  if (deepestSession >= 25) grant('marathon');
  if (state.lastActiveDay !== null && diffDays(day, state.lastActiveDay) >= 15) {
    // ≥15 calendar days between active days = 14+ full days away.
    grant('comeback');
  }

  return {
    ledger,
    achievements,
    streak,
    aggregate: {
      day,
      requestCount: events.length,
      promptTokens,
      completionTokens,
      providers: [...providers].sort(),
      models: [...models].sort(),
      toolUseSession,
      deepSession,
      usageXpAwarded: usageXp,
    },
  };
}
