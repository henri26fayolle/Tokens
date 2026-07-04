import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Phase 2 seed, written from day one (docs/architecture.md §4): notable
 * sessions shaped as postable feed items, unpublished in Phase 1.
 *
 * PRIVACY CONTRACT: `metadata` holds chips only (models, turn count, tool
 * count) and `draft_copy` is generated purely from that metadata — never from
 * conversation content. Enforced by the gateway privacy test allowlist.
 */
export const moments = pgTable('moments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /**
   * Deterministic (user/kind/scope) — reprocessing converges on the latest
   * replay via upsert. Unlike xp_ledger, moments may be UPDATED (a mid-day
   * draft grows as the session does); they are content-free either way.
   */
  idempotencyKey: text('idempotency_key').notNull().unique(),
  /** 'deep-session' | 'marathon' | 'new-model' | … */
  kind: text('kind').notNull(),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  draftCopy: text('draft_copy'),
  published: boolean('published').notNull().default(false),
  /** Set when the user waves off the "share this session?" suggestion. */
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
