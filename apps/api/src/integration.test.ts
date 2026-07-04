import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@kaiden/db';
import * as schema from '@kaiden/db/schema';
import { DbKeyResolver } from '@kaiden/gateway/auth';
import { DrizzleEventSink } from '@kaiden/gateway/events';
import { buildServer as buildGateway } from '@kaiden/gateway/server';
import { MockUpstream } from '@kaiden/gateway/testing/mock-upstream';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildServer } from './server';
import { processUserXp } from './xp/processor';

/**
 * The full product loop against a REAL Postgres schema (PGlite, in-process):
 * migrations → signup (better-auth) → key mint → SDK-shaped calls through the
 * actual gateway → usage_events → XP replay → profile. This is the M3 DoD,
 * plus the live-DB coverage M0–M2 couldn't get without Docker.
 */

interface Address {
  port: number;
}

interface KeyMintResponse {
  id: string;
  key: string;
}

interface ProfileResponse {
  lifetimeXp: number;
  currentStreak: number;
  progress: { intoLevel: number };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

let pglite: PGlite;
let db: Db;
let mock: MockUpstream;
let api: ReturnType<typeof buildServer>;
let gateway: ReturnType<typeof buildGateway>;
let apiUrl = '';
let gatewayUrl = '';
let cookie = '';

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers ?? {}) },
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  const pgliteDb = drizzle(pglite, { schema });
  await migrate(pgliteDb, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)),
  });
  db = pgliteDb as unknown as Db;

  mock = new MockUpstream();
  await mock.start();

  api = buildServer({ db, logLevel: 'silent' });
  await api.listen({ port: 0, host: '127.0.0.1' });
  apiUrl = `http://127.0.0.1:${(api.server.address() as Address).port}`;

  gateway = buildGateway({
    // 50ms cache TTLs so the revocation test doesn't wait a minute.
    keyResolver: new DbKeyResolver(db, 50, 50),
    createEventSink: (log) => new DrizzleEventSink(db, log),
    upstreams: { anthropic: mock.url, openai: mock.url },
    logLevel: 'silent',
  });
  await gateway.listen({ port: 0, host: '127.0.0.1' });
  gatewayUrl = `http://127.0.0.1:${(gateway.server.address() as Address).port}`;
}, 60_000);

afterAll(async () => {
  await api?.close();
  await gateway?.close();
  await mock?.stop();
  await pglite?.close();
});

describe('the full loop: signup → key → gateway → xp → profile', () => {
  it('signs up with email+password and starts at 9-kyū', async () => {
    const response = await apiFetch('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({
        email: 'henri@kaiden.social',
        password: 'super-secret-password',
        name: 'Henri',
        handle: 'henri',
        timezone: 'Europe/Paris',
      }),
    });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    cookie = cookies.map((c) => c.split(';')[0]).join('; ');

    const profile = await json<Record<string, unknown>>(await apiFetch('/v1/me/profile'));
    expect(profile).toMatchObject({
      handle: 'henri',
      level: 1,
      rank: '9-kyū',
      lifetimeXp: 0,
      currentStreak: 0,
      timezone: 'Europe/Paris',
    });
  });

  it('rejects /v1/me/* without a session', async () => {
    const response = await fetch(`${apiUrl}/v1/me/profile`);
    expect(response.status).toBe(401);
  });

  let kaidenKey = '';
  let keyId = '';

  it('mints a gateway key (returned exactly once)', async () => {
    const response = await apiFetch('/v1/me/keys', {
      method: 'POST',
      body: JSON.stringify({ label: 'laptop' }),
    });
    expect(response.status).toBe(201);
    const body = await json<KeyMintResponse>(response);
    expect(body.key).toMatch(/^kd_live_/);
    kaidenKey = body.key;
    keyId = body.id;

    const list = await json<{ keys: unknown[] }>(await apiFetch('/v1/me/keys'));
    expect(list.keys).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(kaidenKey);
  });

  it('proxies real traffic and the whole session becomes XP and profile state', async () => {
    for (let i = 0; i < 15; i += 1) {
      const response = await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'sk-ant-user-owned',
          'x-kaiden-key': kaidenKey,
          'x-kaiden-session': 'first-session',
        },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 32, messages: [] }),
      });
      expect(response.status).toBe(200);
    }

    await vi.waitFor(async () => {
      const events = await db.select().from(schema.usageEvents);
      expect(events).toHaveLength(15);
    });

    const summary = await json<{ lifetimeXp: number }>(
      await apiFetch('/v1/me/xp/process', { method: 'POST' }),
    );
    expect(summary.lifetimeXp).toBeGreaterThan(0);

    // Per-rule assertions (day totals vary with wall-clock hour — night-shift
    // can legitimately fire when this suite runs between 00:00–05:00 Paris).
    const ledger = await db.select().from(schema.xpLedger);
    const byRule = new Map<string, number>();
    for (const row of ledger) byRule.set(row.ruleId, (byRule.get(row.ruleId) ?? 0) + 1);
    expect(byRule.get('active-day')).toBe(1);
    expect(byRule.get('connected')).toBe(1);
    expect(byRule.get('first-provider')).toBe(1);
    expect(byRule.get('first-model')).toBe(1);
    expect(byRule.get('tool-use-day')).toBe(1);
    expect(byRule.get('deep-session-day')).toBe(1);
    expect(byRule.get('streak')).toBe(1);
    expect(byRule.get('usage')).toBeGreaterThan(0);

    const profile = await json<ProfileResponse>(await apiFetch('/v1/me/profile'));
    expect(profile.lifetimeXp).toBe(summary.lifetimeXp);
    expect(profile.currentStreak).toBe(1);
    expect(profile.progress.intoLevel).toBeGreaterThanOrEqual(0);

    const onboarding = await json<Record<string, unknown>>(await apiFetch('/v1/me/onboarding'));
    expect(onboarding).toMatchObject({ connected: true, eventCount: 15 });

    await vi.waitFor(async () => {
      const keys = await json<{ keys: Array<{ lastUsedAt: string | null }> }>(
        await apiFetch('/v1/me/keys'),
      );
      expect(keys.keys[0]?.lastUsedAt).not.toBeNull();
    });
  });

  it('exposes a VAPID public key and stores push subscriptions', async () => {
    const keyResponse = await json<{ publicKey: string }>(await apiFetch('/v1/me/push/public-key'));
    expect(keyResponse.publicKey.length).toBeGreaterThan(20);

    const subscribe = await apiFetch('/v1/me/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://push.example/sub-1',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      }),
    });
    expect(subscribe.status).toBe(200);
    const stored = await db.select().from(schema.pushSubscriptions);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.endpoint).toBe('https://push.example/sub-1');

    const badSubscribe = await apiFetch('/v1/me/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: 'x' }),
    });
    expect(badSubscribe.status).toBe(400);
  });

  it('revoked keys stop working once the gateway cache expires', async () => {
    const revoke = await apiFetch(`/v1/me/keys/${keyId}`, { method: 'DELETE' });
    expect(revoke.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const response = await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kaiden-key': kaidenKey },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });
});

describe('processor against a real database', () => {
  it('is exact and idempotent for a fixed event history', async () => {
    const inserted = await db
      .insert(schema.users)
      .values({ handle: 'fixed', email: 'fixed@kaiden.social', timezone: 'UTC' })
      .returning({ id: schema.users.id });
    const userId = inserted[0]?.id;
    if (!userId) throw new Error('seed user failed');

    const event = (ts: string, extra: Partial<typeof schema.usageEvents.$inferInsert> = {}) => ({
      userId,
      ts: new Date(ts),
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      promptTokens: 1000,
      completionTokens: 500,
      streaming: false,
      toolUse: false,
      toolCallCount: 0,
      ...extra,
    });
    const rows = [
      // Day 1: 12-turn tool session, 18k tokens.
      ...Array.from({ length: 12 }, (_, i) =>
        event(`2026-06-01T10:${String(i).padStart(2, '0')}:00Z`, {
          sessionHint: 's1',
          toolUse: i < 2,
        }),
      ),
      // Day 2: five plain calls, 2.5k tokens.
      ...Array.from({ length: 5 }, (_, i) =>
        event(`2026-06-02T09:0${i}:00Z`, { promptTokens: 300, completionTokens: 200 }),
      ),
      // Day 4 (streak broken): one tiny call.
      event('2026-06-04T12:00:00Z', { promptTokens: 60, completionTokens: 40 }),
    ];
    await db.insert(schema.usageEvents).values(rows);

    const first = await processUserXp(db, userId);
    // Hand-computed from config v2026.07.1 — if this fails, the economy moved.
    expect(first.lifetimeXp).toBe(299);
    expect(first.level).toBe(2);
    expect(first.previousLevel).toBe(1);
    expect(first.newAchievements).toEqual([]);
    expect(first.currentStreak).toBe(1);
    expect(first.longestStreak).toBe(2);

    const countBefore = (await db.select().from(schema.xpLedger)).filter(
      (row) => row.userId === userId,
    ).length;
    expect(countBefore).toBe(67);

    const second = await processUserXp(db, userId);
    expect(second.lifetimeXp).toBe(299);
    const countAfter = (await db.select().from(schema.xpLedger)).filter(
      (row) => row.userId === userId,
    ).length;
    expect(countAfter).toBe(countBefore);

    // Moments: day 1 had a 12-turn session (deep) + first model → 2 rows,
    // stable across reprocessing (upsert, not append).
    const momentRows = (await db.select().from(schema.moments)).filter(
      (row) => row.userId === userId,
    );
    expect(momentRows.map((row) => row.kind).sort()).toEqual(['deep-session', 'new-model']);
    expect(momentRows.every((row) => (row.draftCopy ?? '').length > 0)).toBe(true);

    const userRow = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(userRow[0]).toMatchObject({ lifetimeXp: 299, level: 2, currentStreak: 1 });
  });
});

describe('social: posts, kudos, copies', () => {
  let bobCookie = '';
  let postId = '';

  async function bobFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', cookie: bobCookie, ...(init.headers ?? {}) },
    });
  }

  it('publishing a post attaches verified chips and awards 100 XP', async () => {
    const before = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    const response = await apiFetch('/v1/posts', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Kaiden itself',
        url: 'https://kaiden.social',
        body: 'Built a Strava for AI users in a day.',
        recipe: 'Claude Code + a product brief + relentless milestones.',
      }),
    });
    expect(response.status).toBe(201);
    const post = await json<{
      id: string;
      chips: { models: string[]; rank: string; streak: number };
      author: { handle: string };
    }>(response);
    postId = post.id;
    expect(post.author.handle).toBe('henri');
    expect(post.chips.models).toContain('anthropic/claude-sonnet-5');
    expect(post.chips.rank).toBeDefined();

    const after = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    expect(after.lifetimeXp).toBe(before.lifetimeXp + 100);
  });

  it('rejects garbage posts', async () => {
    const noTitle = await apiFetch('/v1/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'x' }),
    });
    expect(noTitle.status).toBe(400);
    const badUrl = await apiFetch('/v1/posts', {
      method: 'POST',
      body: JSON.stringify({ title: 't', body: 'b', url: 'javascript:alert(1)' }),
    });
    expect(badUrl.status).toBe(400);
  });

  it('the feed is public and shows the post with author rank', async () => {
    const response = await fetch(`${apiUrl}/v1/feed`);
    expect(response.status).toBe(200);
    const feed = await json<{
      posts: Array<{ id: string; author: { handle: string; rank: string }; myKudos: boolean }>;
    }>(response);
    const post = feed.posts.find((p) => p.id === postId);
    expect(post).toBeDefined();
    expect(post?.author.rank).toMatch(/kyū|dan/u);
    expect(post?.myKudos).toBe(false);
  });

  it('kudos: no self-kudos, +5 XP to the author, idempotent across toggles', async () => {
    const self = await apiFetch(`/v1/posts/${postId}/kudos`, { method: 'POST' });
    expect(self.status).toBe(400);

    const signup = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@kaiden.social',
        password: 'another-strong-pass',
        name: 'Bob',
        handle: 'bob',
        timezone: 'UTC',
      }),
    });
    expect(signup.status).toBe(200);
    bobCookie = signup.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    const authorBefore = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    const first = await json<{ kudosCount: number }>(
      await bobFetch(`/v1/posts/${postId}/kudos`, { method: 'POST' }),
    );
    expect(first.kudosCount).toBe(1);
    const authorAfter = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    expect(authorAfter.lifetimeXp).toBe(authorBefore.lifetimeXp + 5);

    // Un-kudos removes the heart but never the XP; re-kudos re-adds the
    // heart but never double-awards.
    const off = await json<{ kudosCount: number }>(
      await bobFetch(`/v1/posts/${postId}/kudos`, { method: 'DELETE' }),
    );
    expect(off.kudosCount).toBe(0);
    const on = await json<{ kudosCount: number }>(
      await bobFetch(`/v1/posts/${postId}/kudos`, { method: 'POST' }),
    );
    expect(on.kudosCount).toBe(1);
    const authorFinal = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    expect(authorFinal.lifetimeXp).toBe(authorBefore.lifetimeXp + 5);
  });

  it('copying a recipe awards the author 15 XP, once per copier', async () => {
    const authorBefore = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    const first = await json<{ copyCount: number }>(
      await bobFetch(`/v1/posts/${postId}/copy`, { method: 'POST' }),
    );
    expect(first.copyCount).toBe(1);
    const again = await json<{ copyCount: number }>(
      await bobFetch(`/v1/posts/${postId}/copy`, { method: 'POST' }),
    );
    expect(again.copyCount).toBe(1);
    const authorAfter = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    expect(authorAfter.lifetimeXp).toBe(authorBefore.lifetimeXp + 15);
  });

  it('comments: flow, moderation rights, and strictly no XP', async () => {
    const authorBefore = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));

    // Bob asks, Henri (author) replies — both fine; no push for self-comment.
    const bobComment = await bobFetch(`/v1/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: 'How did the gateway handle streaming?' }),
    });
    expect(bobComment.status).toBe(201);
    const bobCommentBody = await json<{ id: string }>(bobComment);
    const henriReply = await apiFetch(`/v1/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: 'Byte-identical SSE passthrough with a frame parser.' }),
    });
    expect(henriReply.status).toBe(201);
    const henriReplyBody = await json<{ id: string }>(henriReply);

    // Public list, ascending, with author ranks.
    const list = await json<{ comments: Array<{ id: string; author: { handle: string } }> }>(
      await fetch(`${apiUrl}/v1/posts/${postId}/comments`),
    );
    expect(list.comments.map((c) => c.author.handle)).toEqual(['bob', 'henri']);

    const detail = await json<{ commentCount: number }>(
      await fetch(`${apiUrl}/v1/posts/${postId}`),
    );
    expect(detail.commentCount).toBe(2);

    // Bob cannot delete Henri's comment (neither author nor post owner)…
    expect((await bobFetch(`/v1/comments/${henriReplyBody.id}`, { method: 'DELETE' })).status).toBe(
      404,
    );
    // …but Henri, as post owner, can moderate Bob's comment away.
    expect((await apiFetch(`/v1/comments/${bobCommentBody.id}`, { method: 'DELETE' })).status).toBe(
      200,
    );
    const afterModeration = await json<{ comments: unknown[] }>(
      await fetch(`${apiUrl}/v1/posts/${postId}/comments`),
    );
    expect(afterModeration.comments).toHaveLength(1);

    // Comments never move the economy, in either direction.
    const authorAfter = await json<{ lifetimeXp: number }>(await apiFetch('/v1/me/profile'));
    expect(authorAfter.lifetimeXp).toBe(authorBefore.lifetimeXp);
    const ledger = await db.select().from(schema.xpLedger);
    expect(ledger.some((row) => row.ruleId.includes('comment'))).toBe(false);
  });

  it('public profiles show rank, achievements, and posts', async () => {
    const response = await fetch(`${apiUrl}/v1/users/henri`);
    expect(response.status).toBe(200);
    const profile = await json<{
      handle: string;
      rank: string;
      posts: Array<{ id: string }>;
    }>(response);
    expect(profile.handle).toBe('henri');
    expect(profile.posts.some((p) => p.id === postId)).toBe(true);

    expect((await fetch(`${apiUrl}/v1/users/nobody-here`)).status).toBe(404);
  });
});

describe('leaderboard', () => {
  it('ranks earners, crowns the Meijin, and leaves pure spectators unranked', async () => {
    // A spectator who signs up but never connects earns nothing.
    const signup = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'watcher@kaiden.social',
        password: 'just-here-to-watch',
        name: 'Watcher',
        handle: 'watcher',
        timezone: 'UTC',
      }),
    });
    const watcherCookie = signup.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    // Public board: henri (the only earner) is #1 and wears the Meijin title.
    const board = await json<{
      meijin: string | null;
      entries: Array<{ position: number; handle: string; xp: number }>;
    }>(await fetch(`${apiUrl}/v1/leaderboard`));
    expect(board.meijin).toBe('henri');
    expect(board.entries[0]).toMatchObject({ position: 1, handle: 'henri' });
    // Only XP > 0 appears — no zero-XP accounts padding the ladder.
    expect(board.entries.every((entry) => entry.xp > 0)).toBe(true);
    expect(board.entries.some((entry) => entry.handle === 'watcher')).toBe(false);

    // The earner sees themselves ranked #1…
    const henriView = await json<{ me: { position: number | null } | null }>(
      await apiFetch('/v1/leaderboard'),
    );
    expect(henriView.me?.position).toBe(1);

    // …the spectator sees an honest "unranked" (kudos and copies they gave
    // earned the AUTHOR, never them — giving isn't gaming).
    const watcherView = await json<{ me: { position: number | null } | null }>(
      await fetch(`${apiUrl}/v1/leaderboard`, { headers: { cookie: watcherCookie } }),
    );
    expect(watcherView.me?.position).toBeNull();
  });
});

describe('wrapped', () => {
  it('aggregates the month from daily_activity, ledger, and moments', async () => {
    // Rides on the session user from the full-loop suite (15 calls today).
    const month = new Date().toISOString().slice(0, 7);
    const wrapped = await json<{
      month: string;
      activeDays: number;
      requests: number;
      xpEarned: number;
      bestStreak: number;
      moments: number;
      topModels: Array<{ model: string }>;
    }>(await apiFetch(`/v1/me/wrapped?month=${month}`));

    expect(wrapped.month).toBe(month);
    expect(wrapped.activeDays).toBe(1);
    expect(wrapped.requests).toBe(15);
    expect(wrapped.xpEarned).toBeGreaterThan(0);
    expect(wrapped.bestStreak).toBe(1);
    expect(wrapped.moments).toBeGreaterThanOrEqual(1);
    expect(wrapped.topModels[0]?.model).toBe('anthropic/claude-sonnet-5');
  });
});
