import { createDb, type Db } from './client';

/**
 * URL-driven database factory:
 *   postgres://…  → node-postgres pool (production/local Postgres)
 *   pglite://path → embedded PGlite with migrations auto-applied (Docker-free
 *                   dev; pglite://memory for throwaway state)
 *
 * PGlite is single-process — the api and gateway can't share a pglite file
 * across two processes. Use the api's DEV_EMBED_GATEWAY=1 mode for the full
 * local loop (see apps/api/src/index.ts).
 */
export async function createDatabase(url: string): Promise<Db> {
  if (!url.startsWith('pglite://')) {
    return createDb(url);
  }
  const target = url.slice('pglite://'.length);
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const schema = await import('./schema');
  const client = target === 'memory' || target === '' ? new PGlite() : new PGlite(target);
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: new URL('../migrations', import.meta.url).pathname,
  });
  // Runtime-compatible with the node-postgres instance for every query the
  // codebase issues; the nominal driver generic differs, hence the cast.
  return db as unknown as Db;
}
