import Fastify, { type FastifyBaseLogger } from 'fastify';
import type { KeyResolver } from './auth';
import type { EventSink } from './events';
import { proxyRequest } from './proxy';

/**
 * The gateway sits in the user's critical path, so it stays tiny and boring:
 * no product logic, no DB reads on the hot path, no deploys coupled to app
 * releases (docs/architecture.md §3).
 *
 * PRIVACY POSTURE: request/response bodies are never logged or persisted.
 * Fastify's request logging records method/url only — keep it that way. The
 * privacy test suite in this app is the machine-checked half of the
 * metadata-only promise.
 */
export interface GatewayOptions {
  keyResolver: KeyResolver;
  createEventSink: (log: FastifyBaseLogger) => EventSink;
  upstreams: { anthropic: string; openai: string };
  logLevel?: string;
  loggerStream?: NodeJS.WritableStream;
}

export function buildServer(options: GatewayOptions) {
  const server = Fastify({
    logger: {
      level: options.logLevel ?? process.env.LOG_LEVEL ?? 'info',
      ...(options.loggerStream ? { stream: options.loggerStream } : {}),
    },
    bodyLimit: 32 * 1024 * 1024,
  });

  // Proxied bodies must stay raw bytes — no JSON parsing on the request path.
  server.removeAllContentTypeParsers();
  server.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, done) => {
    done(null, payload);
  });

  const eventSink = options.createEventSink(server.log);

  server.get('/healthz', async () => ({ ok: true, service: 'gateway' }));

  server.all('/anthropic/*', (request, reply) =>
    proxyRequest(request, reply, {
      provider: 'anthropic',
      prefix: '/anthropic',
      upstreamOrigin: options.upstreams.anthropic,
      keyResolver: options.keyResolver,
      eventSink,
    }),
  );

  server.all('/openai/*', (request, reply) =>
    proxyRequest(request, reply, {
      provider: 'openai',
      prefix: '/openai',
      upstreamOrigin: options.upstreams.openai,
      keyResolver: options.keyResolver,
      eventSink,
    }),
  );

  return server;
}
