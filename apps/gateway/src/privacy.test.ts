import {
  columnNamesOf,
  dailyActivity,
  gatewayKeys,
  moments,
  usageEvents,
  userAchievements,
  users,
  xpLedger,
} from '@kaiden/db';
import { describe, expect, it } from 'vitest';

/**
 * THE PRIVACY CONTRACT, MACHINE-CHECKED (CLAUDE.md; docs/architecture.md §3):
 * Kaiden stores metadata only — never prompt/response content, never provider
 * API keys. These allowlists are the storage half of that promise: adding a
 * column to an event-shaped table means updating the allowlist here, in a
 * diff a human has to approve. CI treats this suite as required.
 */

const USAGE_EVENTS_ALLOWED = [
  'id',
  'user_id',
  'ts',
  'provider',
  'model',
  'prompt_tokens',
  'completion_tokens',
  'streaming',
  'tool_use',
  'tool_call_count',
  'stop_reason',
  'latency_ms',
  'user_agent',
  'session_hint',
  'request_id',
  'created_at',
];

const MOMENTS_ALLOWED = [
  'id',
  'user_id',
  'kind',
  'ts',
  'metadata',
  'draft_copy',
  'published',
  'created_at',
];

/** Exact column names that must never exist on any table. */
const FORBIDDEN_COLUMN_NAMES = [
  'content',
  'body',
  'messages',
  'prompt',
  'completion',
  'response',
  'input',
  'output',
  'text',
  'api_key',
  'provider_key',
];

const ALL_TABLES = [
  users,
  gatewayKeys,
  usageEvents,
  xpLedger,
  dailyActivity,
  userAchievements,
  moments,
];

describe('privacy: metadata-only storage', () => {
  it('usage_events columns exactly match the approved metadata allowlist', () => {
    expect(new Set(columnNamesOf(usageEvents))).toEqual(new Set(USAGE_EVENTS_ALLOWED));
  });

  it('moments columns exactly match the approved metadata allowlist', () => {
    expect(new Set(columnNamesOf(moments))).toEqual(new Set(MOMENTS_ALLOWED));
  });

  it('no table has a content-shaped or key-shaped column', () => {
    for (const table of ALL_TABLES) {
      for (const name of columnNamesOf(table)) {
        expect(FORBIDDEN_COLUMN_NAMES).not.toContain(name);
      }
    }
  });
});
