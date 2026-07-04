import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Showcases (the brief's "waza", vibe-coder flavored): a thing you built,
 * with VERIFIED chips snapshotted from gateway metadata at publish time.
 *
 * NOTE ON THE PRIVACY LINE: title/body/recipe are USER-AUTHORED content,
 * written deliberately for publication — a different category from AI
 * conversation content, which is never stored anywhere (docs/architecture.md
 * §3). The `chips` snapshot must remain metadata-only, same as moments.
 */
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    url: text('url'),
    body: text('body').notNull(),
    /** Optional "copy the recipe" payload the author chooses to share. */
    recipe: text('recipe'),
    /** Verified, metadata-only chips: rank/level/streak/models/turns at publish. */
    chips: jsonb('chips').$type<Record<string, unknown>>().notNull().default({}),
    /** Set when published from a detected moment (extra turn/tool chips). */
    momentId: uuid('moment_id'),
    kudosCount: integer('kudos_count').notNull().default(0),
    copyCount: integer('copy_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    published: boolean('published').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('posts_created_idx').on(t.createdAt)],
);

export const kudos = pgTable(
  'kudos',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

/**
 * Flat (unthreaded) comments — communication, deliberately NO XP in either
 * direction (instantly farmable otherwise). User-authored publication
 * content, same category as post bodies. Soft-deletable by the comment
 * author or the post owner (host moderation, Strava-style).
 */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comments_post_created_idx').on(t.postId, t.createdAt)],
);

export const postCopies = pgTable(
  'post_copies',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

/**
 * Directed follows (follower → following). No XP either way — following is
 * attention, not achievement (and farmable otherwise), consistent with the
 * "giving isn't gaming" line the leaderboard proves. The following index
 * serves follower lookups; the PK order serves "who I follow" + the feed.
 */
export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index('follows_following_idx').on(t.followingId),
  ],
);
