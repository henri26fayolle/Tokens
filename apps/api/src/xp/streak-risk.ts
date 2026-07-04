import { type Db, dailyActivity, users } from '@kaiden/db';
import { isValidTimezone, localDayOf, localHourOf } from '@kaiden/xp-engine';
import { and, eq, gt } from 'drizzle-orm';

export interface StreakAtRiskUser {
  id: string;
  handle: string;
  currentStreak: number;
  localDay: string;
}

/**
 * "Your 23-day streak ends at midnight": users with a live streak, no
 * activity today (their local day), local evening (>= 20:00), and not already
 * nudged today. Pure query + filter so tests can pin `now`.
 */
export async function findStreakAtRisk(
  db: Db,
  now: Date = new Date(),
): Promise<StreakAtRiskUser[]> {
  const candidates = await db
    .select({
      id: users.id,
      handle: users.handle,
      currentStreak: users.currentStreak,
      timezone: users.timezone,
      streakPushDay: users.streakPushDay,
    })
    .from(users)
    .where(gt(users.currentStreak, 0));

  const atRisk: StreakAtRiskUser[] = [];
  for (const user of candidates) {
    const timezone = isValidTimezone(user.timezone) ? user.timezone : 'UTC';
    const localDay = localDayOf(now, timezone);
    if (localHourOf(now, timezone) < 20) continue;
    if (user.streakPushDay === localDay) continue;
    const activity = await db
      .select({ day: dailyActivity.day })
      .from(dailyActivity)
      .where(and(eq(dailyActivity.userId, user.id), eq(dailyActivity.day, localDay)))
      .limit(1);
    if (activity.length > 0) continue;
    atRisk.push({ id: user.id, handle: user.handle, currentStreak: user.currentStreak, localDay });
  }
  return atRisk;
}

export async function markStreakNudged(db: Db, userId: string, localDay: string): Promise<void> {
  await db.update(users).set({ streakPushDay: localDay }).where(eq(users.id, userId));
}
