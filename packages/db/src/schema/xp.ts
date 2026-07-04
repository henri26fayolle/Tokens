import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Append-only, non-negative by CHECK constraint: "never claw back earned XP"
 * is enforced by the schema, not by convention. XP totals are sums over this
 * ledger; the idempotency key makes replays/backfills safe.
 */
export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    amount: integer('amount').notNull(),
    ruleId: text('rule_id').notNull(),
    /** XP_CONFIG.version that produced this row. */
    configVersion: text('config_version').notNull(),
    seasonId: text('season_id').notNull(),
    /** User-local day the XP was earned for. */
    day: date('day').notNull(),
    /** e.g. `${userId}/${ruleId}/${day}` for daily-capped rules. */
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('xp_ledger_user_day_idx').on(t.userId, t.day),
    check('xp_ledger_amount_nonnegative', sql`${t.amount} >= 0`),
  ],
);

/**
 * Per user-day aggregate: powers daily caps, streaks, and the stats screen
 * without scanning usage_events.
 */
export const dailyActivity = pgTable(
  'daily_activity',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    day: date('day').notNull(),
    requestCount: integer('request_count').notNull().default(0),
    promptTokens: bigint('prompt_tokens', { mode: 'number' }).notNull().default(0),
    completionTokens: bigint('completion_tokens', { mode: 'number' }).notNull().default(0),
    providers: text('providers').array().notNull().default([]),
    models: text('models').array().notNull().default([]),
    toolUseSession: boolean('tool_use_session').notNull().default(false),
    deepSession: boolean('deep_session').notNull().default(false),
    /** Usage XP already granted today, for cap accounting. */
    usageXpAwarded: integer('usage_xp_awarded').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** Achievement definitions live in @kaiden/xp-config; only grants live in the DB. */
export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    achievementId: text('achievement_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);
