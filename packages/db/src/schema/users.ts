import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  handle: text('handle').notNull().unique(),
  /** IANA timezone — streaks and "active day" are user-local-midnight concepts. */
  timezone: text('timezone').notNull().default('UTC'),
  /** Lifetime and seasonal XP are separate columns from day one (brief §7). */
  lifetimeXp: bigint('lifetime_xp', { mode: 'number' }).notNull().default(0),
  seasonXp: bigint('season_xp', { mode: 'number' }).notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  /** Display cache of levelForXp(lifetimeXp) — the xp_ledger is the source of truth. */
  level: integer('level').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
