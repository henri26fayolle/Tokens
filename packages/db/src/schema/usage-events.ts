import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Append-only. Source of truth for the XP engine — everything downstream is
 * recomputable from this table.
 *
 * PRIVACY CONTRACT: metadata only, never prompt/response content. Any column
 * added here must also be added to the allowlist in the gateway privacy test
 * suite, which is what keeps this promise machine-checked.
 */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    streaming: boolean('streaming').notNull().default(false),
    toolUse: boolean('tool_use').notNull().default(false),
    toolCallCount: integer('tool_call_count').notNull().default(0),
    stopReason: text('stop_reason'),
    latencyMs: integer('latency_ms'),
    userAgent: text('user_agent'),
    /** Client-supplied X-Kaiden-Session header, for turn-depth detection. */
    sessionHint: text('session_hint'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('usage_events_user_ts_idx').on(t.userId, t.ts)],
);
