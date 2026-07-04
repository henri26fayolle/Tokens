import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
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

/**
 * Registers the proxy routes on an existing Fastify instance. The standalone
 * gateway uses this via buildServer; the api's DEV_EMBED_GATEWAY mode mounts
 * the same routes in-process so PGlite dev works without two processes.
 * The host server must parse bodies as raw Buffers.
 */
export function registerGatewayRoutes(server: FastifyInstance, options: GatewayOptions): void {
  const eventSink = options.createEventSink(server.log);

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

  /**
   * Key-in-path form for tools that allow a base URL but not custom headers
   * (Cursor, OpenWebUI, …): base URL = /k/<kaiden-key>/<provider>[/v1].
   * The key segment is equivalent to the X-Kaiden-Key header: stripped before
   * anything goes upstream, and REDACTED from logs (see redactKeyInPath —
   * the privacy suite asserts it never appears).
   */
  const pathKeyHandler =
    (provider: 'anthropic' | 'openai') => (request: FastifyRequest, reply: FastifyReply) => {
      const { key } = request.params as { key: string };
      request.headers['x-kaiden-key'] = key;
      return proxyRequest(request, reply, {
        provider,
        prefix: `/k/${key}/${provider}`,
        upstreamOrigin: options.upstreams[provider],
        keyResolver: options.keyResolver,
        eventSink,
      });
    };
  server.all('/k/:key/anthropic/*', pathKeyHandler('anthropic'));
  server.all('/k/:key/openai/*', pathKeyHandler('openai'));
}

/** Kaiden keys may ride in the URL path (/k/<key>/…) — never let them reach logs. */
export function redactKeyInPath(url: string): string {
  return url.replace(/\/k\/[^/]+/, '/k/[redacted]');
}

export function buildServer(options: GatewayOptions) {
  const server = Fastify({
    logger: {
      level: options.logLevel ?? process.env.LOG_LEVEL ?? 'info',
      ...(options.loggerStream ? { stream: options.loggerStream } : {}),
      serializers: {
        req(request: FastifyRequest) {
          return {
            method: request.method,
            url: redactKeyInPath(request.url),
            host: request.hostname,
            remoteAddress: request.ip,
          };
        },
      },
    },
    bodyLimit: 32 * 1024 * 1024,
    // Behind Railway's proxy: x-forwarded-* is the truth.
    trustProxy: true,
  });

  // Proxied bodies must stay raw bytes — no JSON parsing on the request path.
  server.removeAllContentTypeParsers();
  server.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, done) => {
    done(null, payload);
  });

  server.get('/healthz', async () => ({ ok: true, service: 'gateway' }));

  registerGatewayRoutes(server, options);

  return server;
}
