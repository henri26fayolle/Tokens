import { buildServer } from './server';

const port = Number(process.env.GATEWAY_PORT ?? 4100);
const server = buildServer();

server.listen({ port, host: '0.0.0.0' }).catch((err) => {
  server.log.error(err);
  process.exit(1);
});
