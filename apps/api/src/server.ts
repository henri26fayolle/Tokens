import type { Db } from '@kaiden/db';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Auth, createAuth } from './auth';
import { registerMeRoutes } from './routes/me';

export interface ApiOptions {
  db: Db;
  secret?: string;
  /** Public origin of this API (used by better-auth); omit to infer per-request. */
  baseURL?: string;
  logLevel?: string;
  loggerStream?: NodeJS.WritableStream;
}

/** Product API: auth, profile, stats, keys, onboarding (M3 — build-plan.md). */
export function buildServer(options: ApiOptions) {
  const server = Fastify({
    logger: {
      level: options.logLevel ?? process.env.LOG_LEVEL ?? 'info',
      ...(options.loggerStream ? { stream: options.loggerStream } : {}),
    },
  });

  // Bodies arrive as raw Buffers: better-auth parses its own requests, and
  // /v1 routes parse JSON explicitly (same pattern as the gateway).
  server.removeAllContentTypeParsers();
  server.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, done) => {
    done(null, payload);
  });

  const secret = options.secret ?? process.env.BETTER_AUTH_SECRET ?? '';
  const effectiveSecret = secret || 'kaiden-dev-secret-change-me';
  const auth = createAuth({ db: options.db, secret: effectiveSecret, baseURL: options.baseURL });

  server.get('/healthz', async () => ({ ok: true, service: 'api' }));

  server.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      if (!secret && process.env.NODE_ENV === 'production') {
        return reply.code(500).send({ error: 'BETTER_AUTH_SECRET is required in production' });
      }
      const response = await auth.handler(toWebRequest(request));
      await sendWebResponse(reply, response);
    },
  });

  registerMeRoutes(server, { db: options.db, auth });

  return server;
}

export type ApiServer = ReturnType<typeof buildServer>;
export type { Auth };

function toWebRequest(request: FastifyRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
  }
  const body =
    Buffer.isBuffer(request.body) && request.body.length > 0
      ? new Uint8Array(request.body)
      : undefined;
  const origin = `${request.protocol}://${request.hostname}:${request.port}`;
  return new Request(`${origin}${request.url}`, { method: request.method, headers, body });
}

async function sendWebResponse(reply: FastifyReply, response: Response): Promise<void> {
  reply.status(response.status);
  for (const [name, value] of response.headers.entries()) {
    if (name === 'set-cookie' || name === 'content-length' || name === 'transfer-encoding')
      continue;
    reply.header(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  const body = Buffer.from(await response.arrayBuffer());
  reply.send(body.length > 0 ? body : '');
}
