import { type Db, users, xpLedger } from '@kaiden/db';
import { XP_CONFIG, type XpConfig } from '@kaiden/xp-config';
import { levelForXp } from '@kaiden/xp-engine';
import { eq, sql } from 'drizzle-orm';

export interface UserTotals {
  lifetimeXp: number;
  seasonXp: number;
  level: number;
}

/**
 * Recompute lifetime/season XP and level from the ledger (the source of
 * truth) and write them onto the user row. Used by the usage processor and
 * by social actions — the ledger may contain rows from either path.
 */
export async function refreshUserTotals(
  db: Db,
  userId: string,
  config: XpConfig = XP_CONFIG,
): Promise<UserTotals> {
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
  await db.update(users).set({ lifetimeXp, seasonXp, level }).where(eq(users.id, userId));
  return { lifetimeXp, seasonXp, level };
}
