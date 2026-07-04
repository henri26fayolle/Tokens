import Fastify from 'fastify';

/** Product API: auth, profiles, stats, onboarding (M3 — build-plan.md). */
export function buildServer() {
  const server = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  server.get('/healthz', async () => ({ ok: true, service: 'api' }));

  server.get('/v1/profile', async (_request, reply) =>
    reply.code(501).send({ error: 'not_implemented', milestone: 'M3' }),
  );

  return server;
}
