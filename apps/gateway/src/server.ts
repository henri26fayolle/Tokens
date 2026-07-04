import Fastify from 'fastify';

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
export function buildServer() {
  const server = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  server.get('/healthz', async () => ({ ok: true, service: 'gateway' }));

  // M1: streaming passthrough + usage-metadata extraction (build-plan.md).
  const notImplemented = {
    handler: async (
      _request: unknown,
      reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    ) => reply.code(501).send({ error: 'not_implemented', milestone: 'M1' }),
  };
  server.all('/anthropic/*', notImplemented.handler);
  server.all('/openai/*', notImplemented.handler);

  return server;
}
