import { createDb } from '@kaiden/db';
import type { FastifyBaseLogger } from 'fastify';
import { DbKeyResolver, type KeyResolver, StaticKeyResolver } from './auth';
import { DrizzleEventSink, type EventSink, LogEventSink } from './events';
import { buildServer } from './server';

const DEV_USER_ID = '00000000-0000-0000-0000-000000000000';

const upstreams = {
  anthropic: process.env.ANTHROPIC_UPSTREAM ?? 'https://api.anthropic.com',
  openai: process.env.OPENAI_UPSTREAM ?? 'https://api.openai.com',
};

const databaseUrl = process.env.DATABASE_URL;
const devKey = process.env.KAIDEN_DEV_KEY;

let keyResolver: KeyResolver;
let createEventSink: (log: FastifyBaseLogger) => EventSink;

if (databaseUrl) {
  const db = createDb(databaseUrl);
  keyResolver = new DbKeyResolver(db);
  createEventSink = (log) => new DrizzleEventSink(db, log);
} else if (devKey) {
  keyResolver = new StaticKeyResolver(devKey, DEV_USER_ID);
  createEventSink = (log) => new LogEventSink(log);
} else {
  console.error(
    'Refusing to start an open proxy: set DATABASE_URL (normal mode) or KAIDEN_DEV_KEY (dev mode, events logged not persisted).',
  );
  process.exit(1);
}

// Railway/hosts inject PORT; GATEWAY_PORT is the local convention.
const port = Number(process.env.PORT ?? process.env.GATEWAY_PORT ?? 4100);
const server = buildServer({ keyResolver, createEventSink, upstreams });

server.listen({ port, host: '0.0.0.0' }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
