import { type Db, pushSubscriptions } from '@kaiden/db';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import webpush from 'web-push';

export interface PushKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path the notification opens. */
  url: string;
}

/**
 * VAPID keys come from env in production. The dev fallback generates a pair
 * per boot — dev subscriptions die on restart, which is fine.
 */
export function resolveVapidKeys(log: FastifyBaseLogger): PushKeys {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) return { publicKey, privateKey };
  const generated = webpush.generateVAPIDKeys();
  log.warn('VAPID keys not set — generated a dev pair (push subscriptions reset on restart)');
  return { publicKey: generated.publicKey, privateKey: generated.privateKey };
}

export class PushSender {
  constructor(
    private readonly db: Db,
    private readonly keys: PushKeys,
    private readonly log: FastifyBaseLogger,
    private readonly subject = process.env.VAPID_SUBJECT ?? 'mailto:hello@kaiden.social',
  ) {}

  get publicKey(): string {
    return this.keys.publicKey;
  }

  /** Sends to every subscription a user has; prunes dead endpoints (404/410). */
  async send(userId: string, payload: PushPayload): Promise<void> {
    const subs = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    const body = JSON.stringify(payload);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { vapidDetails: { subject: this.subject, ...this.keys }, TTL: 3600 },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          this.log.warn({ status }, 'push send failed');
        }
      }
    }
  }
}
