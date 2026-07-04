import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One table for auth identity (better-auth core fields) AND game profile.
 * better-auth maps its `user` model here (see apps/api/src/auth.ts);
 * xp/streak columns are Kaiden's own and invisible to the auth layer.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  handle: text('handle').notNull().unique(),
  name: text('name').notNull().default(''),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** IANA timezone — streaks and "active day" are user-local-midnight concepts. */
  timezone: text('timezone').notNull().default('UTC'),
  /** Lifetime and seasonal XP are separate columns from day one (brief §7). */
  lifetimeXp: bigint('lifetime_xp', { mode: 'number' }).notNull().default(0),
  seasonXp: bigint('season_xp', { mode: 'number' }).notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  /** Display cache of levelForXp(lifetimeXp) — the xp_ledger is the source of truth. */
  level: integer('level').notNull().default(1),
  /** Last user-local day a streak-at-risk push was sent (max one per day). */
  streakPushDay: text('streak_push_day'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
