import {
  type Db,
  dailyActivity,
  gatewayKeys,
  moments,
  pushSubscriptions,
  usageEvents,
  userAchievements,
  users,
  xpLedger,
} from '@kaiden/db';
import { generateGatewayKey, hashGatewayKey } from '@kaiden/shared';
import { XP_CONFIG } from '@kaiden/xp-config';
import { diffDays, rankForLevel, xpToReachLevel } from '@kaiden/xp-engine';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth';
import type { PushSender } from '../push';
import { processUserXp } from '../xp/processor';

interface Deps {
  db: Db;
  auth: Auth;
  push: PushSender;
}

interface SessionUser {
  id: string;
  handle: string;
}

function parseJsonBody(request: FastifyRequest): Record<string, unknown> {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(request.body.toString('utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function registerMeRoutes(server: FastifyInstance, deps: Deps): void {
  const requireUser = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SessionUser | null> => {
    const headers = new Headers();
    if (request.headers.cookie) headers.set('cookie', String(request.headers.cookie));
    const session = await deps.auth.api.getSession({ headers });
    if (!session) {
      await reply.code(401).send({ error: 'unauthorized' });
      return null;
    }
    return session.user as unknown as SessionUser;
  };

  server.get('/v1/me/profile', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const rows = await deps.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const levelFloor = xpToReachLevel(row.level, XP_CONFIG);
    const nextLevelAt = xpToReachLevel(row.level + 1, XP_CONFIG);
    return {
      handle: row.handle,
      level: row.level,
      rank: rankForLevel(row.level, XP_CONFIG),
      lifetimeXp: row.lifetimeXp,
      seasonXp: row.seasonXp,
      seasonId: XP_CONFIG.season.current,
      currentStreak: row.currentStreak,
      longestStreak: row.longestStreak,
      timezone: row.timezone,
      progress: {
        intoLevel: row.lifetimeXp - levelFloor,
        neededForNext: nextLevelAt - levelFloor,
      },
    };
  });

  server.get('/v1/me/stats', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const query = request.query as Record<string, string | undefined>;
    const days = Math.min(Math.max(Number(query.days ?? 30) || 30, 1), 365);
    const rows = await deps.db
      .select()
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, user.id))
      .orderBy(desc(dailyActivity.day))
      .limit(days);
    return { days: rows.reverse() };
  });

  server.get('/v1/me/achievements', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const granted = await deps.db
      .select({
        achievementId: userAchievements.achievementId,
        grantedAt: userAchievements.grantedAt,
      })
      .from(userAchievements)
      .where(eq(userAchievements.userId, user.id));
    const grantedById = new Map(granted.map((row) => [row.achievementId, row.grantedAt]));
    return {
      achievements: XP_CONFIG.achievements.map((definition) => ({
        ...definition,
        grantedAt: grantedById.get(definition.id) ?? null,
      })),
    };
  });

  server.post('/v1/me/keys', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = parseJsonBody(request);
    const label = typeof body.label === 'string' && body.label.length > 0 ? body.label : null;
    const key = generateGatewayKey();
    const inserted = await deps.db
      .insert(gatewayKeys)
      .values({ userId: user.id, keyHash: hashGatewayKey(key), label })
      .returning({ id: gatewayKeys.id, createdAt: gatewayKeys.createdAt });
    const row = inserted[0];
    if (!row) return reply.code(500).send({ error: 'key_creation_failed' });
    // The key itself is returned exactly once; only its hash is stored.
    return reply.code(201).send({ id: row.id, key, label, createdAt: row.createdAt });
  });

  server.get('/v1/me/keys', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const rows = await deps.db
      .select({
        id: gatewayKeys.id,
        label: gatewayKeys.label,
        lastUsedAt: gatewayKeys.lastUsedAt,
        createdAt: gatewayKeys.createdAt,
        revokedAt: gatewayKeys.revokedAt,
      })
      .from(gatewayKeys)
      .where(eq(gatewayKeys.userId, user.id))
      .orderBy(desc(gatewayKeys.createdAt));
    return { keys: rows };
  });

  server.delete('/v1/me/keys/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const revoked = await deps.db
      .update(gatewayKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(gatewayKeys.id, id), eq(gatewayKeys.userId, user.id), isNull(gatewayKeys.revokedAt)),
      )
      .returning({ id: gatewayKeys.id });
    if (revoked.length === 0) return reply.code(404).send({ error: 'not_found' });
    // The gateway's key cache holds positives up to 60s; revocation is
    // effective within that window, not instantly (documented tradeoff).
    return { revoked: true };
  });

  server.post('/v1/me/xp/process', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return processUserXp(deps.db, user.id);
  });

  server.get('/v1/me/push/public-key', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return { publicKey: deps.push.publicKey };
  });

  server.post('/v1/me/push/subscribe', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = parseJsonBody(request);
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
    const keys = (body.keys ?? {}) as Record<string, unknown>;
    const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : null;
    const authKey = typeof keys.auth === 'string' ? keys.auth : null;
    if (!endpoint || !p256dh || !authKey) {
      return reply.code(400).send({ error: 'invalid_subscription' });
    }
    await deps.db
      .insert(pushSubscriptions)
      .values({ userId: user.id, endpoint, p256dh, auth: authKey })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh, auth: authKey },
      });
    return { subscribed: true };
  });

  server.post('/v1/me/push/unsubscribe', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = parseJsonBody(request);
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;
    if (!endpoint) return reply.code(400).send({ error: 'invalid_subscription' });
    await deps.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
    return { subscribed: false };
  });

  server.get('/v1/me/wrapped', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const query = request.query as Record<string, string | undefined>;
    const month = /^\d{4}-\d{2}$/.test(query.month ?? '')
      ? (query.month as string)
      : new Date().toISOString().slice(0, 7);

    const days = await deps.db
      .select()
      .from(dailyActivity)
      .where(
        and(
          eq(dailyActivity.userId, user.id),
          sql`${dailyActivity.day}::text LIKE ${`${month}-%`}`,
        ),
      )
      .orderBy(dailyActivity.day);

    const xpRows = await deps.db
      .select({ total: sql<number>`coalesce(sum(${xpLedger.amount}), 0)::int` })
      .from(xpLedger)
      .where(and(eq(xpLedger.userId, user.id), sql`${xpLedger.day}::text LIKE ${`${month}-%`}`));

    const momentRows = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(moments)
      .where(and(eq(moments.userId, user.id), sql`${moments.ts}::text LIKE ${`${month}-%`}`));

    const modelDays = new Map<string, number>();
    let requests = 0;
    let tokens = 0;
    let deepSessions = 0;
    let bestStreak = 0;
    let run = 0;
    let previousDay: string | null = null;
    for (const day of days) {
      requests += day.requestCount;
      tokens += day.promptTokens + day.completionTokens;
      if (day.deepSession) deepSessions += 1;
      for (const model of day.models) modelDays.set(model, (modelDays.get(model) ?? 0) + 1);
      run = previousDay !== null && diffDays(day.day, previousDay) === 1 ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
      previousDay = day.day;
    }
    const topModels = [...modelDays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([model, count]) => ({ model, days: count }));

    return {
      month,
      activeDays: days.length,
      requests,
      tokens,
      deepSessions,
      bestStreak,
      xpEarned: xpRows[0]?.total ?? 0,
      moments: momentRows[0]?.count ?? 0,
      topModels,
    };
  });

  server.get('/v1/me/onboarding', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const rows = await deps.db
      .select({
        eventCount: sql<number>`count(*)::int`,
        firstEventAt: sql<string | null>`min(${usageEvents.ts})`,
      })
      .from(usageEvents)
      .where(eq(usageEvents.userId, user.id));
    const row = rows[0];
    return {
      connected: (row?.eventCount ?? 0) > 0,
      eventCount: row?.eventCount ?? 0,
      firstEventAt: row?.firstEventAt ?? null,
    };
  });
}
