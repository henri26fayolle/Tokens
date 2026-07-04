import {
  type Db,
  dailyActivity,
  kudos,
  moments,
  postCopies,
  posts,
  userAchievements,
  users,
} from '@kaiden/db';
import { XP_CONFIG } from '@kaiden/xp-config';
import { rankForLevel } from '@kaiden/xp-engine';
import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from '../auth';
import { awardSocialXp } from '../xp/social';
import { makeOptionalUser, makeRequireUser } from './session';

interface Deps {
  db: Db;
  auth: Auth;
}

const LIMITS = { title: 80, body: 500, recipe: 4000, url: 500, postsPerDay: 5 } as const;

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

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function validHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

interface FeedAuthor {
  handle: string;
  level: number;
  rank: string;
}

function toFeedPost(
  post: typeof posts.$inferSelect,
  author: FeedAuthor,
  myKudos: boolean,
): Record<string, unknown> {
  return {
    id: post.id,
    title: post.title,
    url: post.url,
    body: post.body,
    recipe: post.recipe,
    chips: post.chips,
    kudosCount: post.kudosCount,
    copyCount: post.copyCount,
    createdAt: post.createdAt,
    author,
    myKudos,
  };
}

export function registerPostRoutes(server: FastifyInstance, deps: Deps): void {
  const requireUser = makeRequireUser(deps.auth);
  const optionalUser = makeOptionalUser(deps.auth);

  server.get('/v1/feed', async (request) => {
    const me = await optionalUser(request);
    const query = request.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 50);
    const before = query.before ? new Date(query.before) : null;

    const conditions = [isNull(posts.deletedAt), eq(posts.published, true)];
    if (before && !Number.isNaN(before.getTime())) conditions.push(lt(posts.createdAt, before));

    const rows = await deps.db
      .select({ post: posts, handle: users.handle, level: users.level })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    const myKudosIds = new Set<string>();
    if (me && rows.length > 0) {
      const ids = rows.map((row) => row.post.id);
      const mine = await deps.db
        .select({ postId: kudos.postId })
        .from(kudos)
        .where(and(eq(kudos.userId, me.id), inArray(kudos.postId, ids)));
      for (const row of mine) myKudosIds.add(row.postId);
    }

    return {
      posts: rows.map((row) =>
        toFeedPost(
          row.post,
          { handle: row.handle, level: row.level, rank: rankForLevel(row.level, XP_CONFIG) },
          myKudosIds.has(row.post.id),
        ),
      ),
      nextBefore: rows.length === limit ? (rows[rows.length - 1]?.post.createdAt ?? null) : null,
    };
  });

  server.post('/v1/posts', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = parseJsonBody(request);

    const title = cleanString(body.title, LIMITS.title);
    const text = cleanString(body.body, LIMITS.body);
    const url =
      body.url === undefined || body.url === '' ? null : cleanString(body.url, LIMITS.url);
    const recipe =
      body.recipe === undefined || body.recipe === ''
        ? null
        : cleanString(body.recipe, LIMITS.recipe);
    if (!title || !text) return reply.code(400).send({ error: 'title_and_body_required' });
    if (body.url && (!url || !validHttpUrl(url)))
      return reply.code(400).send({ error: 'invalid_url' });

    const since = new Date(Date.now() - 86_400_000);
    const [recent] = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(eq(posts.userId, user.id), gt(posts.createdAt, since)));
    if ((recent?.count ?? 0) >= LIMITS.postsPerDay) {
      return reply.code(429).send({ error: 'daily_post_limit' });
    }

    // Verified chips: metadata-only snapshot of the author's recent practice.
    const [author] = await deps.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!author) return reply.code(404).send({ error: 'not_found' });
    const recentDays = await deps.db
      .select({ models: dailyActivity.models })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, user.id))
      .orderBy(desc(dailyActivity.day))
      .limit(7);
    const models = [...new Set(recentDays.flatMap((day) => day.models))].slice(0, 6);
    const chips: Record<string, unknown> = {
      rank: rankForLevel(author.level, XP_CONFIG),
      level: author.level,
      streak: author.currentStreak,
      models,
    };
    const momentId = typeof body.momentId === 'string' ? body.momentId : null;
    if (momentId) {
      const [moment] = await deps.db
        .select()
        .from(moments)
        .where(and(eq(moments.id, momentId), eq(moments.userId, user.id)))
        .limit(1);
      if (moment) {
        chips.moment = { kind: moment.kind, ...moment.metadata };
      }
    }

    const [created] = await deps.db
      .insert(posts)
      .values({ userId: user.id, title, url, body: text, recipe, chips, momentId })
      .returning();
    if (!created) return reply.code(500).send({ error: 'post_failed' });

    await awardSocialXp(deps.db, {
      userId: user.id,
      ruleId: 'waza-published',
      amount: XP_CONFIG.social.publishWazaXp,
      idempotencyKey: `${user.id}/post/${created.id}`,
    });

    return reply.code(201).send(
      toFeedPost(
        created,
        {
          handle: author.handle,
          level: author.level,
          rank: rankForLevel(author.level, XP_CONFIG),
        },
        false,
      ),
    );
  });

  server.delete('/v1/posts/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const deleted = await deps.db
      .update(posts)
      .set({ deletedAt: new Date() })
      .where(and(eq(posts.id, id), eq(posts.userId, user.id), isNull(posts.deletedAt)))
      .returning({ id: posts.id });
    if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' });
    // Earned social XP stays — the ledger is append-only (no clawback).
    return { deleted: true };
  });

  server.post('/v1/posts/:id/kudos', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const [post] = await deps.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .limit(1);
    if (!post) return reply.code(404).send({ error: 'not_found' });
    if (post.userId === user.id) return reply.code(400).send({ error: 'no_self_kudos' });

    const inserted = await deps.db
      .insert(kudos)
      .values({ postId: post.id, userId: user.id })
      .onConflictDoNothing()
      .returning({ postId: kudos.postId });

    if (inserted.length > 0) {
      await deps.db
        .update(posts)
        .set({ kudosCount: sql`${posts.kudosCount} + 1` })
        .where(eq(posts.id, post.id));
      const position = post.kudosCount + 1;
      const amount =
        position <= XP_CONFIG.social.kudosDecayAfter
          ? XP_CONFIG.social.kudosReceivedXp
          : XP_CONFIG.social.kudosDecayedXp;
      await awardSocialXp(deps.db, {
        userId: post.userId,
        ruleId: 'kudos-received',
        amount,
        // Once per (post, kudoser), ever — re-kudos after un-kudos is a no-op.
        idempotencyKey: `${post.userId}/kudos/${post.id}/${user.id}`,
      });
    }
    const [fresh] = await deps.db
      .select({ kudosCount: posts.kudosCount })
      .from(posts)
      .where(eq(posts.id, post.id));
    return { kudos: true, kudosCount: fresh?.kudosCount ?? post.kudosCount };
  });

  server.delete('/v1/posts/:id/kudos', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const removed = await deps.db
      .delete(kudos)
      .where(and(eq(kudos.postId, id), eq(kudos.userId, user.id)))
      .returning({ postId: kudos.postId });
    if (removed.length > 0) {
      await deps.db
        .update(posts)
        .set({ kudosCount: sql`greatest(${posts.kudosCount} - 1, 0)` })
        .where(eq(posts.id, id));
    }
    const [fresh] = await deps.db
      .select({ kudosCount: posts.kudosCount })
      .from(posts)
      .where(eq(posts.id, id));
    return { kudos: false, kudosCount: fresh?.kudosCount ?? 0 };
  });

  server.post('/v1/posts/:id/copy', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const [post] = await deps.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .limit(1);
    if (!post) return reply.code(404).send({ error: 'not_found' });

    if (post.userId !== user.id) {
      const inserted = await deps.db
        .insert(postCopies)
        .values({ postId: post.id, userId: user.id })
        .onConflictDoNothing()
        .returning({ postId: postCopies.postId });
      if (inserted.length > 0) {
        await deps.db
          .update(posts)
          .set({ copyCount: sql`${posts.copyCount} + 1` })
          .where(eq(posts.id, post.id));
        await awardSocialXp(deps.db, {
          userId: post.userId,
          ruleId: 'waza-copied',
          amount: XP_CONFIG.social.wazaCopiedXp,
          idempotencyKey: `${post.userId}/copy/${post.id}/${user.id}`,
        });
      }
    }
    const [fresh] = await deps.db
      .select({ copyCount: posts.copyCount })
      .from(posts)
      .where(eq(posts.id, post.id));
    return { copied: true, copyCount: fresh?.copyCount ?? post.copyCount };
  });

  server.get('/v1/users/:handle', async (request, reply) => {
    const { handle } = request.params as { handle: string };
    const [row] = await deps.db
      .select()
      .from(users)
      .where(eq(users.handle, handle.toLowerCase()))
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const granted = await deps.db
      .select({
        achievementId: userAchievements.achievementId,
        grantedAt: userAchievements.grantedAt,
      })
      .from(userAchievements)
      .where(eq(userAchievements.userId, row.id));

    const recent = await deps.db
      .select()
      .from(posts)
      .where(and(eq(posts.userId, row.id), isNull(posts.deletedAt), eq(posts.published, true)))
      .orderBy(desc(posts.createdAt))
      .limit(20);
    const author: FeedAuthor = {
      handle: row.handle,
      level: row.level,
      rank: rankForLevel(row.level, XP_CONFIG),
    };

    return {
      handle: row.handle,
      level: row.level,
      rank: author.rank,
      lifetimeXp: row.lifetimeXp,
      seasonXp: row.seasonXp,
      seasonId: XP_CONFIG.season.current,
      currentStreak: row.currentStreak,
      longestStreak: row.longestStreak,
      memberSince: row.createdAt,
      achievements: granted,
      posts: recent.map((post) => toFeedPost(post, author, false)),
    };
  });
}
