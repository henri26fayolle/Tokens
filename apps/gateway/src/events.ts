import { type Db, usageEvents } from '@kaiden/db';
import type { UsageEventMeta } from '@kaiden/shared';
import type { FastifyBaseLogger } from 'fastify';

export interface EventSink {
  write(event: UsageEventMeta): void;
}

/**
 * Fire-and-forget: a failed metadata write must NEVER fail or slow the
 * user's request (docs/architecture.md §3). Errors are logged by error name
 * only — no request context, by design.
 */
export class DrizzleEventSink implements EventSink {
  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
  ) {}

  write(event: UsageEventMeta): void {
    void this.db
      .insert(usageEvents)
      .values({
        userId: event.userId,
        ts: event.ts,
        provider: event.provider,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        streaming: event.streaming,
        toolUse: event.toolUse,
        toolCallCount: event.toolCallCount,
        stopReason: event.stopReason,
        latencyMs: event.latencyMs,
        userAgent: event.userAgent,
        sessionHint: event.sessionHint,
        requestId: event.requestId,
      })
      .then(
        () => {},
        (error: unknown) => {
          this.log.error(
            { code: error instanceof Error ? error.name : 'unknown' },
            'usage event write failed',
          );
        },
      );
  }
}

/** Used when the gateway runs without DATABASE_URL: metadata-only, to the log. */
export class LogEventSink implements EventSink {
  constructor(private readonly log: FastifyBaseLogger) {}

  write(event: UsageEventMeta): void {
    this.log.info({ usage: event }, 'usage event (no DATABASE_URL — not persisted)');
  }
}
