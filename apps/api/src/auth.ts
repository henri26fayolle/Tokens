import { randomUUID } from 'node:crypto';
import { accounts, type Db, sessions, users, verifications } from '@kaiden/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export interface CreateAuthOptions {
  db: Db;
  secret: string;
  /** Omit to let better-auth infer from the incoming request (tests). */
  baseURL?: string;
}

/**
 * Email+password is always on (curl-exercisable, zero external config).
 * GitHub OAuth switches on when GITHUB_CLIENT_ID/SECRET are present.
 * Magic link is deferred until an email provider is chosen (M4).
 */
export function createAuth({ db, secret, baseURL }: CreateAuthOptions) {
  const github =
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          },
        }
      : undefined;

  return betterAuth({
    secret,
    ...(baseURL ? { baseURL } : {}),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: { enabled: true },
    ...(github ? { socialProviders: github } : {}),
    user: {
      additionalFields: {
        handle: { type: 'string', required: true, input: true },
        timezone: { type: 'string', required: false, input: true, defaultValue: 'UTC' },
      },
    },
    advanced: {
      // Our tables use uuid primary keys; better-auth's default ids are not uuids.
      database: { generateId: () => randomUUID() },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
