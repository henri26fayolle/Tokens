import { type Db, findActiveGatewayKeyByHash, touchGatewayKey } from '@kaiden/db';
import { hashGatewayKey } from '@kaiden/shared';

export interface Principal {
  userId: string;
}

export interface KeyResolver {
  resolve(key: string): Promise<Principal | null>;
}

interface CacheEntry {
  userId: string | null;
  expiresAt: number;
}

/**
 * X-Kaiden-Key → user lookup with a TTL cache so the DB stays off the hot
 * path (docs/architecture.md §3). Misses are cached too (shorter TTL) so a
 * bad key can't hammer the database.
 */
export class DbKeyResolver implements KeyResolver {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly db: Db,
    private readonly ttlMs = 60_000,
    private readonly negativeTtlMs = 10_000,
  ) {}

  async resolve(key: string): Promise<Principal | null> {
    const hash = hashGatewayKey(key);
    const cached = this.cache.get(hash);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.userId ? { userId: cached.userId } : null;
    }
    if (this.cache.size > 10_000) this.cache.clear();

    const row = await findActiveGatewayKeyByHash(this.db, hash);

    this.cache.set(hash, {
      userId: row?.userId ?? null,
      expiresAt: Date.now() + (row ? this.ttlMs : this.negativeTtlMs),
    });

    if (row) {
      // Fire-and-forget bookkeeping; never on the response path.
      void touchGatewayKey(this.db, row.id).then(
        () => {},
        () => {},
      );
      return { userId: row.userId };
    }
    return null;
  }
}

/** Dev-mode resolver (KAIDEN_DEV_KEY) — no database required. */
export class StaticKeyResolver implements KeyResolver {
  constructor(
    private readonly key: string,
    private readonly userId: string,
  ) {}

  async resolve(key: string): Promise<Principal | null> {
    return key === this.key ? { userId: this.userId } : null;
  }
}
