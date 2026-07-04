import type { Provider, UsageEventMeta } from '@kaiden/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type Dispatcher, request as upstreamRequest } from 'undici';
import type { KeyResolver } from './auth';
import type { EventSink } from './events';
import { emptyDraft, pickExtractor, type UsageDraft } from './extractors';
import { createSseFrameTransform } from './sse';

/**
 * Stripped from the outgoing upstream request. The Kaiden headers stay with
 * us; hop-by-hop headers are recomputed; accept-encoding is pinned to
 * identity so usage fields are parseable in transit. Provider auth headers
 * (x-api-key / authorization) pass through UNTOUCHED and are never stored.
 */
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'accept-encoding',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'upgrade',
  'expect',
  'x-kaiden-key',
  'x-kaiden-session',
]);

const STRIP_RESPONSE_HEADERS = new Set(['connection', 'transfer-encoding', 'keep-alive']);

export interface ProxyContext {
  provider: Provider;
  prefix: string;
  upstreamOrigin: string;
  keyResolver: KeyResolver;
  eventSink: EventSink;
}

export async function proxyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: ProxyContext,
): Promise<void> {
  const startedAt = Date.now();

  const kaidenKey = request.headers['x-kaiden-key'];
  if (typeof kaidenKey !== 'string' || kaidenKey.length === 0) {
    await reply.code(401).send({ error: 'missing X-Kaiden-Key header' });
    return;
  }
  // Same response for unknown and revoked keys — no existence oracle.
  const principal = await ctx.keyResolver.resolve(kaidenKey);
  if (!principal) {
    await reply.code(401).send({ error: 'invalid Kaiden key' });
    return;
  }

  const suffix = request.url.slice(ctx.prefix.length) || '/';
  const path = suffix.split('?')[0] ?? suffix;
  const extractor = request.method === 'POST' ? pickExtractor(ctx.provider, path) : null;

  let body = Buffer.isBuffer(request.body) ? request.body : undefined;
  let injected = false;
  if (body && body.length > 0 && extractor?.rewriteRequestBody) {
    const rewritten = extractor.rewriteRequestBody(body);
    if (rewritten) {
      body = rewritten;
      injected = true;
    }
  }

  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && !STRIP_REQUEST_HEADERS.has(name)) headers[name] = value;
  }
  headers['accept-encoding'] = 'identity';
  if (body) headers['content-length'] = String(body.byteLength);

  let upstream: Dispatcher.ResponseData;
  try {
    upstream = await upstreamRequest(ctx.upstreamOrigin + suffix, {
      method: request.method as Dispatcher.HttpMethod,
      headers,
      body,
      headersTimeout: 300_000,
      bodyTimeout: 600_000,
    });
  } catch (error) {
    request.log.error(
      { code: error instanceof Error ? error.name : 'unknown' },
      'upstream request failed',
    );
    await reply.code(502).send({ error: 'upstream unreachable' });
    return;
  }

  reply.code(upstream.statusCode);
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (value !== undefined && !STRIP_RESPONSE_HEADERS.has(name)) reply.header(name, value);
  }

  const contentType = String(upstream.headers['content-type'] ?? '');
  const streaming = contentType.includes('text/event-stream');
  const requestId =
    firstHeader(upstream.headers['request-id']) ?? firstHeader(upstream.headers['x-request-id']);

  const finish = (draft: UsageDraft) => {
    const event: UsageEventMeta = {
      userId: principal.userId,
      ts: new Date(startedAt),
      provider: ctx.provider,
      model: draft.model ?? 'unknown',
      promptTokens: draft.promptTokens,
      completionTokens: draft.completionTokens,
      streaming,
      toolUse: draft.toolCallCount > 0,
      toolCallCount: draft.toolCallCount,
      stopReason: draft.stopReason,
      latencyMs: Date.now() - startedAt,
      userAgent: firstHeader(request.headers['user-agent']),
      sessionHint: firstHeader(request.headers['x-kaiden-session']),
      requestId,
    };
    ctx.eventSink.write(event);
  };

  // Non-extractable endpoints and error responses: pure passthrough, no event.
  if (!extractor || upstream.statusCode >= 300) {
    await reply.send(upstream.body);
    return;
  }

  if (streaming) {
    const collector = extractor.createStreamCollector(injected);
    const transform = createSseFrameTransform((frame) => collector.handleFrame(frame));
    let finished = false;
    const complete = () => {
      if (!finished) {
        finished = true;
        finish(collector.result());
      }
    };
    transform.once('end', complete);
    transform.once('close', complete);
    upstream.body.once('error', (error: Error) => transform.destroy(error));
    await reply.send(upstream.body.pipe(transform));
    return;
  }

  // Non-streaming: buffer, parse usage from a copy, forward the exact bytes.
  const raw = Buffer.from(await upstream.body.arrayBuffer());
  try {
    finish(extractor.parseResponseJson(JSON.parse(raw.toString('utf8'))));
  } catch {
    finish(emptyDraft());
  }
  await reply.send(raw);
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
