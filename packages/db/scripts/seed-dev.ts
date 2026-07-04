/**
 * Dev-only: create (or reuse) a user and mint a gateway key for local testing.
 *
 *   pnpm --filter @kaiden/db seed:dev [handle]
 *
 * Prints the key ONCE — only its hash is stored, per the privacy contract.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/client';
import { gatewayKeys, users } from '../src/schema';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kaiden:kaiden@localhost:5433/kaiden';
const handle = process.argv[2] ?? 'dev';
const db = createDb(databaseUrl);

const existing = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.handle, handle))
  .limit(1);
const userId =
  existing[0]?.id ?? (await db.insert(users).values({ handle }).returning({ id: users.id }))[0]?.id;
if (!userId) throw new Error('failed to create user');

const key = `kd_live_${randomBytes(24).toString('base64url')}`;
await db.insert(gatewayKeys).values({
  userId,
  keyHash: createHash('sha256').update(key).digest('hex'),
  label: 'seed-dev',
});

console.log(`user:  ${handle} (${userId})
key:   ${key}

Store the key now — only its hash is saved.

Point your SDKs at the gateway:
  Anthropic base URL:  http://localhost:4100/anthropic
  OpenAI base URL:     http://localhost:4100/openai/v1
  Extra header:        X-Kaiden-Key: ${key}`);
process.exit(0);
