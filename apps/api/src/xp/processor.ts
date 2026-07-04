import { type Db, dailyActivity, usageEvents, userAchievements, users, xpLedger } from '@kaiden/db';
import { XP_CONFIG, type XpConfig } from '@kaiden/xp-config';
import {
  computeUser,
  type EngineEvent,
  isValidTimezone,
  levelForXp,
  rankForLevel,
} from '@kaiden/xp-engine';
import { asc, eq, sql } from 'drizzle-orm';

export interface ProcessSummary {
  userId: string;
  handle: string;
  lifetimeXp: number;
  seasonXp: number;
  level: number;
  rank: string;
  currentStreak: number;
  longestStreak: number;
  eventCount: number;
  proposedLedgerRows: number;
  achievements: string[];
}

const INSERT_CHUNK = 500;

/**
 * Persist one user's full XP replay, idempotently. Safe to run any number of
 * times, at any cadence: the engine's deterministic idempotency keys +
 * ON CONFLICT DO NOTHING mean the ledger converges on the identical row set
 * (see packages/xp-engine — the M2 replay guarantee). This IS the backfill
 * command; there is deliberately no other write path to xp_ledger.
 */
export async function processUserXp(
  db: Db,
  userId: string,
  config: XpConfig = XP_CONFIG,
): Promise<ProcessSummary> {
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error(`user not found: ${userId}`);
  const timezone = isValidTimezone(user.timezone) ? user.timezone : 'UTC';

  const rows = await db
    .select({
      id: usageEvents.id,
      ts: usageEvents.ts,
      provider: usageEvents.provider,
      model: usageEvents.model,
      promptTokens: usageEvents.promptTokens,
      completionTokens: usageEvents.completionTokens,
      toolUse: usageEvents.toolUse,
      sessionHint: usageEvents.sessionHint,
    })
    .from(usageEvents)
    .where(eq(usageEvents.userId, userId))
    .orderBy(asc(usageEvents.ts), asc(usageEvents.id));
  const events: EngineEvent[] = rows;

  const computed = computeUser({ userId, timezone, events }, config);

  for (let i = 0; i < computed.ledger.length; i += INSERT_CHUNK) {
    const chunk = computed.ledger.slice(i, i + INSERT_CHUNK);
    await db
      .insert(xpLedger)
      .values(
        chunk.map((row) => ({
          userId,
          amount: row.amount,
          ruleId: row.ruleId,
          configVersion: config.version,
          seasonId: config.season.current,
          day: row.day,
          idempotencyKey: row.idempotencyKey,
        })),
      )
      .onConflictDoNothing({ target: xpLedger.idempotencyKey });
  }

  if (computed.achievements.length > 0) {
    await db
      .insert(userAchievements)
      .values(computed.achievements.map((achievementId) => ({ userId, achievementId })))
      .onConflictDoNothing();
  }

  for (const day of computed.days) {
    const values = {
      userId,
      day: day.day,
      requestCount: day.requestCount,
      promptTokens: day.promptTokens,
      completionTokens: day.completionTokens,
      providers: day.providers,
      models: day.models,
      toolUseSession: day.toolUseSession,
      deepSession: day.deepSession,
      usageXpAwarded: day.usageXpAwarded,
    };
    await db
      .insert(dailyActivity)
      .values(values)
      .onConflictDoUpdate({ target: [dailyActivity.userId, dailyActivity.day], set: values });
  }

  // The DB, not the in-memory computation, is authoritative for totals —
  // it may contain rows from earlier config versions (never clawed back).
  const [totals] = await db
    .select({
      lifetime: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int`,
      season: sql<number>`coalesce(sum(${xpLedger.amount}) filter (where ${xpLedger.seasonId} = ${config.season.current}), 0)::int`,
    })
    .from(xpLedger)
    .where(eq(xpLedger.userId, userId));
  const lifetimeXp = totals?.lifetime ?? 0;
  const seasonXp = totals?.season ?? 0;
  const level = levelForXp(lifetimeXp, config);

  await db
    .update(users)
    .set({
      lifetimeXp,
      seasonXp,
      level,
      currentStreak: computed.currentStreak,
      longestStreak: Math.max(user.longestStreak, computed.longestStreak),
    })
    .where(eq(users.id, userId));

  return {
    userId,
    handle: user.handle,
    lifetimeXp,
    seasonXp,
    level,
    rank: rankForLevel(level, config),
    currentStreak: computed.currentStreak,
    longestStreak: Math.max(user.longestStreak, computed.longestStreak),
    eventCount: events.length,
    proposedLedgerRows: computed.ledger.length,
    achievements: computed.achievements,
  };
}
