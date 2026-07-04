/**
 * Programmatic migration runner for deploys (no drizzle-kit at runtime).
 * The api container runs this before starting: idempotent, fails loudly.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb(databaseUrl);
await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
console.log('migrations applied');
process.exit(0);
