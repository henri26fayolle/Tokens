import {
  type Db,
  dailyActivity,
  gatewayKeys,
  usageEvents,
  userAchievements,
  users,
} from '@kaiden/db';
import { generateGatewayKey, hashGatewayKey } from '@kaiden/shared';
import { XP_CONFIG } from '@kaiden/xp-config';
import { rankForLevel, xpToReachLevel } from '@kaiden/xp-engine';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth';
import { processUserXp } from '../xp/processor';

interface Deps {
  db: Db;
  auth: Auth;
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
