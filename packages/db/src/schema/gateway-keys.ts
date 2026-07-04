import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Kaiden keys identify the user at the gateway (X-Kaiden-Key header), stored
 * hashed. Provider API keys are NEVER stored anywhere — they pass through the
 * gateway untouched (docs/architecture.md §3).
 */
export const gatewayKeys = pgTable('gateway_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  keyHash: text('key_hash').notNull().unique(),
  label: text('label'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
