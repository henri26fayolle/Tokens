import {
  type Db,
  dailyActivity,
  moments,
  usageEvents,
  userAchievements,
  users,
  xpLedger,
} from '@kaiden/db';
import { XP_CONFIG, type XpConfig } from '@kaiden/xp-config';
import { computeUser, type EngineEvent, isValidTimezone, rankForLevel } from '@kaiden/xp-engine';
import { asc, eq } from 'drizzle-orm';
import { refreshUserTotals } from './totals';

export interface ProcessSummary {
  userId: string;
  handle: string;
  lifetimeXp: number;
  seasonXp: number;
  level: number;
  /** Level before this run — level > previousLevel means a level-up push. */
  previousLevel: number;
  rank: string;
  currentStreak: number;
  longestStreak: number;
  eventCount: number;
  proposedLedgerRows: number;
  /** Every achievement the replay proposes (all-time). */
  achievements: string[];
  /** Only the ones this run actually inserted — push-notification material. */
  newAchievements: string[];
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

  let newAchievements: string[] = [];
  if (computed.achievements.length > 0) {
    const inserted = await db
      .insert(userAchievements)
      .values(computed.achievements.map((achievementId) => ({ userId, achievementId })))
      .onConflictDoNothing()
      .returning({ achievementId: userAchievements.achievementId });
    newAchievements = inserted.map((row) => row.achievementId);
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

  // Moments upsert (converge-to-latest replay — unlike the append-only
  // ledger, a mid-day draft legitimately grows as the session does).
  for (const moment of computed.moments) {
    const values = {
      userId,
      idempotencyKey: moment.idempotencyKey,
      kind: moment.kind,
      ts: moment.ts,
      metadata: moment.metadata,
      draftCopy: moment.draftCopy,
    };
    await db
      .insert(moments)
      .values(values)
      .onConflictDoUpdate({
        target: moments.idempotencyKey,
        set: { ts: values.ts, metadata: values.metadata, draftCopy: values.draftCopy },
      });
  }

  // The DB, not the in-memory computation, is authoritative for totals — it
  // may contain rows from earlier config versions (never clawed back) and
  // social XP rows written outside this replay (xp/social.ts).
  const { lifetimeXp, seasonXp, level } = await refreshUserTotals(db, userId, config);

  await db
    .update(users)
    .set({
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
    previousLevel: user.level,
    rank: rankForLevel(level, config),
    currentStreak: computed.currentStreak,
    longestStreak: Math.max(user.longestStreak, computed.longestStreak),
    eventCount: events.length,
    proposedLedgerRows: computed.ledger.length,
    achievements: computed.achievements,
    newAchievements,
  };
}
