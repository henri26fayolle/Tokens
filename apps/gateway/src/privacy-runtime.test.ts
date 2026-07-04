import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import type { UsageEventMeta } from '@kaiden/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StaticKeyResolver } from './auth';
import type { EventSink } from './events';
import { buildServer } from './server';
import { MockUpstream, SENTINEL_PROMPT, SENTINEL_RESPONSE } from './testing/mock-upstream';

/**
 * THE PRIVACY CONTRACT, RUNTIME HALF (docs/architecture.md §3; the schema
 * half lives in privacy.test.ts): sentinel strings are sent through the
 * gateway in the prompt, echoed by the mock provider in the response, and a
 * sentinel-shaped provider API key rides the auth header. If any of them
 * appear in gateway logs or captured usage events, this suite fails — and it
 * must be treated as a release blocker, never skipped.
 */

const TEST_KEY = 'kd_live_privacy_key';
const PROVIDER_KEY = 'sk-ant-PROVIDER_KEY_SENTINEL_77dd';

class CaptureLog extends Writable {
  readonly lines: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: () => void): void {
    this.lines.push(String(chunk));
    callback();
  }
}

let mock: MockUpstream;
let gateway: ReturnType<typeof buildServer>;
let gatewayUrl = '';
const logs = new CaptureLog();
const events: UsageEventMeta[] = [];

beforeAll(async () => {
  mock = new MockUpstream();
  await mock.start();
  const sink: EventSink = {
    write: (event) => {
      events.push(event);
    },
  };
  gateway = buildServer({
    keyResolver: new StaticKeyResolver(TEST_KEY, '22222222-2222-2222-2222-222222222222'),
    createEventSink: () => sink,
    upstreams: { anthropic: mock.url, openai: mock.url },
    logLevel: 'info',
    loggerStream: logs,
  });
  await gateway.listen({ port: 0, host: '127.0.0.1' });
  gatewayUrl = `http://127.0.0.1:${(gateway.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await gateway.close();
  await mock.stop();
});

describe('privacy: nothing content-shaped escapes the request path', () => {
  it('logs and events stay sentinel-free across non-streaming and streaming traffic', async () => {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': PROVIDER_KEY,
      'x-kaiden-key': TEST_KEY,
    };
    await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 32,
        messages: [{ role: 'user', content: SENTINEL_PROMPT }],
      }),
    }).then((response) => response.text());

    await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 32,
        stream: true,
        messages: [{ role: 'user', content: SENTINEL_PROMPT }],
      }),
    }).then((response) => response.text());

    await fetch(`${gatewayUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { ...headers, authorization: `Bearer ${PROVIDER_KEY}` },
      body: JSON.stringify({
        model: 'gpt-5.2',
        stream: true,
        messages: [{ role: 'user', content: SENTINEL_PROMPT }],
      }),
    }).then((response) => response.text());

    // The traffic itself carried the sentinels end-to-end…
    expect(events.length).toBeGreaterThanOrEqual(3);

    // …but neither logs nor stored metadata may contain any of them.
    const everything = logs.lines.join('') + JSON.stringify(events);
    expect(everything).not.toContain(SENTINEL_PROMPT);
    expect(everything).not.toContain(SENTINEL_RESPONSE);
    expect(everything).not.toContain(PROVIDER_KEY);
  });
});
