import type { Db } from '@kaiden/db';
import { xpLedger } from '@kaiden/db';
import { XP_CONFIG, type XpConfig } from '@kaiden/xp-config';
import { refreshUserTotals } from './totals';

/**
 * Social XP (publish / kudos-received / waza-copied) is awarded here by api
 * actions — NOT by the usage-replay engine. Same append-only ledger, same
 * idempotency-key discipline, same no-clawback rule: removing a kudos keeps
 * the XP. Social rule ids: 'waza-published', 'kudos-received', 'waza-copied'.
 */
export async function awardSocialXp(
  db: Db,
  input: { userId: string; ruleId: string; amount: number; idempotencyKey: string },
  config: XpConfig = XP_CONFIG,
): Promise<boolean> {
  if (input.amount <= 0) return false;
  const inserted = await db
    .insert(xpLedger)
    .values({
      userId: input.userId,
      amount: input.amount,
      ruleId: input.ruleId,
      configVersion: config.version,
      seasonId: config.season.current,
      // Bookkeeping day for social rows is UTC — they sit outside the
      // user-local daily caps by construction (uncapped per brief §6).
      day: new Date().toISOString().slice(0, 10),
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: xpLedger.idempotencyKey })
    .returning({ id: xpLedger.id });
  if (inserted.length > 0) {
    await refreshUserTotals(db, input.userId, config);
    return true;
  }
  return false;
}
