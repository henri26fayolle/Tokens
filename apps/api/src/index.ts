import { createDatabase, usageEvents } from '@kaiden/db';
import { XP_CONFIG } from '@kaiden/xp-config';
import { rankForLevel } from '@kaiden/xp-engine';
import { buildServer, getPushSender } from './server';
import { processUserXp } from './xp/processor';
import { findStreakAtRisk, markStreakNudged } from './xp/streak-risk';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL is required (postgres://… or pglite://.data/dev for Docker-free local dev).',
  );
  process.exit(1);
}

const port = Number(process.env.API_PORT ?? 4000);
const db = await createDatabase(databaseUrl);
const server = buildServer({
  db,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.API_URL ?? `http://localhost:${port}`,
});
const push = getPushSender(server);

/**
 * DEV ONLY: mount the gateway's proxy routes in this process. PGlite is
 * single-process, so this is how the full local loop (gateway events → XP →
 * profile) runs without Docker. Production keeps the gateway separate.
 */
if (process.env.DEV_EMBED_GATEWAY === '1') {
  const { registerGatewayRoutes } = await import('@kaiden/gateway/server');
  const { DbKeyResolver } = await import('@kaiden/gateway/auth');
  const { DrizzleEventSink } = await import('@kaiden/gateway/events');
  registerGatewayRoutes(server, {
    keyResolver: new DbKeyResolver(db),
    createEventSink: (log) => new DrizzleEventSink(db, log),
    upstreams: {
      anthropic: process.env.ANTHROPIC_UPSTREAM ?? 'https://api.anthropic.com',
      openai: process.env.OPENAI_UPSTREAM ?? 'https://api.openai.com',
    },
  });
  server.log.warn('DEV_EMBED_GATEWAY=1 — gateway routes mounted in-process (dev only)');
}

server.listen({ port, host: '0.0.0.0' }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});

/**
 * M4 XP + notification sweep. Idempotent by construction (processor.ts), so
 * overlap with manual runs is harmless. Pushes fire on transitions the sweep
 * itself observes: level-ups, new achievements, streak-at-risk evenings.
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
        const summary = await processUserXp(db, userId);
        if (summary.level > summary.previousLevel) {
          await push.send(userId, {
            title: `Level ${summary.level} — ${rankForLevel(summary.level, XP_CONFIG)}`,
            body: 'You just ranked up. The climb continues.',
            url: '/home',
          });
        }
        for (const id of summary.newAchievements) {
          const definition = XP_CONFIG.achievements.find((a) => a.id === id);
          await push.send(userId, {
            title: `Achievement: ${definition?.name ?? id}`,
            body: definition?.description ?? 'Unlocked.',
            url: '/home',
          });
        }
      }
      const atRisk = await findStreakAtRisk(db);
      for (const user of atRisk) {
        await push.send(user.id, {
          title: `${user.currentStreak}-day streak at risk`,
          body: 'One session before midnight keeps it alive.',
          url: '/home',
        });
        await markStreakNudged(db, user.id, user.localDay);
      }
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
