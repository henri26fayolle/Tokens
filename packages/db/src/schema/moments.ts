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
  /** 'deep_session' | 'multi_tool' | 'new_model' | … */
  kind: text('kind').notNull(),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  draftCopy: text('draft_copy'),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
