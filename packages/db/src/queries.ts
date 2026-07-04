import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client';
import { gatewayKeys } from './schema';

export interface ActiveGatewayKey {
  id: string;
  userId: string;
}

/** Kaiden-key lookup for the gateway: hash → active (non-revoked) key. */
export async function findActiveGatewayKeyByHash(
  db: Db,
  keyHash: string,
): Promise<ActiveGatewayKey | null> {
  const rows = await db
    .select({ id: gatewayKeys.id, userId: gatewayKeys.userId })
    .from(gatewayKeys)
    .where(and(eq(gatewayKeys.keyHash, keyHash), isNull(gatewayKeys.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchGatewayKey(db: Db, keyId: string): Promise<void> {
  await db.update(gatewayKeys).set({ lastUsedAt: new Date() }).where(eq(gatewayKeys.id, keyId));
}
