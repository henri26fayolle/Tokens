import { createDb, usageEvents } from '@kaiden/db';
import { buildServer } from './server';
import { processUserXp } from './xp/processor';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required for the api.');
  process.exit(1);
}

const port = Number(process.env.API_PORT ?? 4000);
const db = createDb(databaseUrl);
const server = buildServer({
  db,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.API_URL ?? `http://localhost:${port}`,
});

server.listen({ port, host: '0.0.0.0' }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});

/**
 * M3 XP trigger: a lightweight sweep so XP appears without manual runs.
 * Idempotent by construction (see processor.ts), so overlap with manual
 * xp:process runs is harmless. M4 may replace this with an event-driven
 * nudge for the instant "app lights up" onboarding moment.
 */
const intervalMs = Number(process.env.XP_PROCESS_INTERVAL_MS ?? 60_000);
if (intervalMs > 0) {
  let sweeping = false;
  setInterval(async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      const active = await db.selectDistinct({ userId: usageEvents.userId }).from(usageEvents);
      for (const { userId } of active) {
        await processUserXp(db, userId);
      }
      if (active.length > 0) server.log.info({ users: active.length }, 'xp sweep complete');
    } catch (error) {
      server.log.error(
        { code: error instanceof Error ? error.name : 'unknown' },
        'xp sweep failed',
      );
    } finally {
      sweeping = false;
    }
  }, intervalMs).unref();
}
