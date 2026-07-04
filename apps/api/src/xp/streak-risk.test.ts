import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@kaiden/db';
import * as schema from '@kaiden/db/schema';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findStreakAtRisk, markStreakNudged } from './streak-risk';

let pglite: PGlite;
let db: Db;
let streakyId = '';
let activeTodayId = '';

// 21:30 UTC on July 4 — evening for a UTC-timezone user.
const EVENING = new Date('2026-07-04T21:30:00Z');
const MORNING = new Date('2026-07-04T09:00:00Z');

beforeAll(async () => {
  pglite = new PGlite();
  const pgliteDb = drizzle(pglite, { schema });
  await migrate(pgliteDb, {
    migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)),
  });
  db = pgliteDb as unknown as Db;

  const inserted = await db
    .insert(schema.users)
    .values([
      { handle: 'streaky', email: 'streaky@test.dev', timezone: 'UTC', currentStreak: 23 },
      { handle: 'active', email: 'active@test.dev', timezone: 'UTC', currentStreak: 5 },
      { handle: 'nostreak', email: 'nostreak@test.dev', timezone: 'UTC', currentStreak: 0 },
    ])
    .returning({ id: schema.users.id, handle: schema.users.handle });
  streakyId = inserted.find((row) => row.handle === 'streaky')?.id ?? '';
  activeTodayId = inserted.find((row) => row.handle === 'active')?.id ?? '';

  // 'active' already has a session today — no nudge needed.
  await db.insert(schema.dailyActivity).values({
    userId: activeTodayId,
    day: '2026-07-04',
    requestCount: 3,
  });
});

afterAll(async () => {
  await pglite?.close();
});

describe('streak-at-risk detection', () => {
  it('flags evening users with a live streak and no activity today', async () => {
    const atRisk = await findStreakAtRisk(db, EVENING);
    expect(atRisk.map((user) => user.handle)).toEqual(['streaky']);
    expect(atRisk[0]).toMatchObject({ currentStreak: 23, localDay: '2026-07-04' });
  });

  it('stays quiet before local evening', async () => {
    expect(await findStreakAtRisk(db, MORNING)).toEqual([]);
  });

  it('nudges at most once per local day', async () => {
    await markStreakNudged(db, streakyId, '2026-07-04');
    expect(await findStreakAtRisk(db, EVENING)).toEqual([]);
    // …and re-arms the next day.
    const nextEvening = new Date('2026-07-05T21:30:00Z');
    const tomorrow = await findStreakAtRisk(db, nextEvening);
    expect(tomorrow.map((user) => user.handle).sort()).toEqual(['active', 'streaky']);
  });
});
