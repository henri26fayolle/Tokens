/**
 * Run the XP replay for one user or everyone. Idempotent — this is also the
 * backfill/repair command (see processor.ts).
 *
 *   pnpm --filter @kaiden/api xp:process <handle>
 *   pnpm --filter @kaiden/api xp:process --all
 */
import { createDb, users } from '@kaiden/db';
import { eq } from 'drizzle-orm';
import { processUserXp } from '../src/xp/processor';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kaiden:kaiden@localhost:5433/kaiden';
const target = process.argv[2];
if (!target) {
  console.error('usage: xp:process <handle> | --all');
  process.exit(1);
}

const db = createDb(databaseUrl);
const targets =
  target === '--all'
    ? await db.select({ id: users.id }).from(users)
    : await db.select({ id: users.id }).from(users).where(eq(users.handle, target));

if (targets.length === 0) {
  console.error(`no users matched: ${target}`);
  process.exit(1);
}

for (const { id } of targets) {
  const summary = await processUserXp(db, id);
  console.log(
    `${summary.handle}: ${summary.lifetimeXp} XP → level ${summary.level} (${summary.rank}), ` +
      `streak ${summary.currentStreak} (best ${summary.longestStreak}), ` +
      `${summary.eventCount} events, ${summary.proposedLedgerRows} ledger rows proposed` +
      (summary.achievements.length ? `, achievements: ${summary.achievements.join(', ')}` : ''),
  );
}
process.exit(0);
