import { buildServer } from './server';

const port = Number(process.env.API_PORT ?? 4000);
const server = buildServer();

server.listen({ port, host: '0.0.0.0' }).catch((err) => {
  server.log.error(err);
  process.exit(1);
});
