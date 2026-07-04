import { type Db, users } from '@kaiden/db';
import { XP_CONFIG } from '@kaiden/xp-config';
import { rankForLevel } from '@kaiden/xp-engine';
import { and, asc, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Auth } from '../auth';
import { makeOptionalUser } from './session';

interface Deps {
  db: Db;
  auth: Auth;
}

type Board = 'season' | 'lifetime';

type UserRow = Pick<
  typeof users.$inferSelect,
  'handle' | 'level' | 'lifetimeXp' | 'seasonXp' | 'currentStreak' | 'createdAt'
>;

function toEntry(row: UserRow, board: Board): Record<string, unknown> {
  return {
    handle: row.handle,
    level: row.level,
    rank: rankForLevel(row.level, XP_CONFIG),
    xp: board === 'lifetime' ? row.lifetimeXp : row.seasonXp,
    lifetimeXp: row.lifetimeXp,
    seasonXp: row.seasonXp,
    currentStreak: row.currentStreak,
  };
}

/**
 * Public leaderboard. Ranked by seasonal XP (default) or lifetime; streaks
 * are shown but NEVER ranked (streak competition turns unhealthy). Only
 * users with XP > 0 appear, so never-connected accounts and pure spectators
 * don't pad the board. Ties break by who reached it first (createdAt asc).
 * Season #1 wears the Meijin (名人) title. No new privacy surface — public
 * profiles already expose these fields.
 */
export function registerLeaderboardRoutes(server: FastifyInstance, deps: Deps): void {
  const optionalUser = makeOptionalUser(deps.auth);

  server.get('/v1/leaderboard', async (request) => {
    const me = await optionalUser(request);
    const query = request.query as Record<string, string | undefined>;
    const board: Board = query.board === 'lifetime' ? 'lifetime' : 'season';
    const xpColumn = board === 'lifetime' ? users.lifetimeXp : users.seasonXp;

    const rows = await deps.db
      .select({
        handle: users.handle,
        level: users.level,
        lifetimeXp: users.lifetimeXp,
        seasonXp: users.seasonXp,
        currentStreak: users.currentStreak,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(gt(xpColumn, 0))
      .orderBy(desc(xpColumn), asc(users.createdAt))
      .limit(50);

    const entries = rows.map((row, index) => ({ position: index + 1, ...toEntry(row, board) }));

    let meEntry: Record<string, unknown> | null = null;
    if (me) {
      const [meRow] = await deps.db
        .select({
          handle: users.handle,
          level: users.level,
          lifetimeXp: users.lifetimeXp,
          seasonXp: users.seasonXp,
          currentStreak: users.currentStreak,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, me.id))
        .limit(1);
      if (meRow) {
        const myXp = board === 'lifetime' ? meRow.lifetimeXp : meRow.seasonXp;
        if (myXp > 0) {
          // Position = (users ranked strictly above me) + 1. Strict > and
          // strict earlier-createdAt tie-break mean I never count myself.
          const [ranked] = await deps.db
            .select({ above: sql<number>`count(*)::int` })
            .from(users)
            .where(
              or(gt(xpColumn, myXp), and(eq(xpColumn, myXp), lt(users.createdAt, meRow.createdAt))),
            );
          meEntry = { position: (ranked?.above ?? 0) + 1, isMe: true, ...toEntry(meRow, board) };
        } else {
          meEntry = { position: null, isMe: true, ...toEntry(meRow, board) };
        }
      }
    }

    return {
      board,
      season: XP_CONFIG.season.current,
      meijin: rows[0]?.handle ?? null,
      entries,
      me: meEntry,
    };
  });
}
