import type { AddressInfo } from 'node:net';
import Anthropic from '@anthropic-ai/sdk';
import type { UsageEventMeta } from '@kaiden/shared';
import OpenAI from 'openai';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaticKeyResolver } from './auth';
import type { EventSink } from './events';
import { buildServer } from './server';
import { MockUpstream, SENTINEL_PROMPT } from './testing/mock-upstream';

const TEST_KEY = 'kd_live_test_key';
const TEST_USER = '11111111-1111-1111-1111-111111111111';

let mock: MockUpstream;
let gateway: ReturnType<typeof buildServer>;
let gatewayUrl = '';
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
    keyResolver: new StaticKeyResolver(TEST_KEY, TEST_USER),
    createEventSink: () => sink,
    upstreams: { anthropic: mock.url, openai: mock.url },
    logLevel: 'silent',
  });
  await gateway.listen({ port: 0, host: '127.0.0.1' });
  gatewayUrl = `http://127.0.0.1:${(gateway.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await gateway.close();
  await mock.stop();
});

beforeEach(() => {
  events.length = 0;
  mock.requests.length = 0;
});

function anthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: 'sk-ant-test-dummy',
    baseURL: `${gatewayUrl}/anthropic`,
    defaultHeaders: { 'X-Kaiden-Key': TEST_KEY },
  });
}

function openaiClient(): OpenAI {
  return new OpenAI({
    apiKey: 'sk-openai-test-dummy',
    baseURL: `${gatewayUrl}/openai/v1`,
    defaultHeaders: { 'X-Kaiden-Key': TEST_KEY },
  });
}

describe('auth', () => {
  it('rejects requests without a Kaiden key', async () => {
    const response = await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(401);
  });

  it('rejects unknown keys with the same shape (no existence oracle)', async () => {
    const response = await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', 'x-kaiden-key': 'kd_live_wrong' },
    });
    expect(response.status).toBe(401);
    expect(mock.requests.length).toBe(0);
  });
});

describe('anthropic passthrough', () => {
  it('non-streaming: real SDK round-trip, metadata event captured', async () => {
    const message = await anthropicClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 64,
      messages: [{ role: 'user', content: SENTINEL_PROMPT }],
    });

    expect(message.usage.input_tokens).toBe(17);
    expect(message.stop_reason).toBe('tool_use');

    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0]).toMatchObject({
      userId: TEST_USER,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      promptTokens: 17,
      completionTokens: 5,
      streaming: false,
      toolUse: true,
      toolCallCount: 1,
      stopReason: 'tool_use',
      requestId: 'req_mock_1',
    });

    const seen = mock.lastRequest();
    expect(seen?.headers['x-api-key']).toBe('sk-ant-test-dummy');
    expect(seen?.headers['x-kaiden-key']).toBeUndefined();
    expect(seen?.headers['x-kaiden-session']).toBeUndefined();
    expect(seen?.headers['accept-encoding']).toBe('identity');
  });

  it('non-streaming: body is byte-identical to a direct call', async () => {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'sk-ant-test-dummy' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 64, messages: [] }),
    };
    const direct = await (await fetch(`${mock.url}/v1/messages`, init)).text();
    const viaGateway = await (
      await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
        ...init,
        headers: { ...init.headers, 'x-kaiden-key': TEST_KEY },
      })
    ).text();
    expect(viaGateway).toBe(direct);
  });

  it('streaming: real SDK round-trip, stream events intact, metadata captured', async () => {
    const stream = await anthropicClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 64,
      messages: [{ role: 'user', content: SENTINEL_PROMPT }],
      stream: true,
    });

    const types: string[] = [];
    for await (const event of stream) types.push(event.type);
    expect(types[0]).toBe('message_start');
    expect(types).toContain('content_block_delta');
    expect(types[types.length - 1]).toBe('message_stop');

    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      promptTokens: 17,
      completionTokens: 9,
      streaming: true,
      toolCallCount: 1,
      stopReason: 'tool_use',
    });
  });

  it('streaming: bytes are identical to a direct call', async () => {
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'sk-ant-test-dummy' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 64,
        messages: [],
        stream: true,
      }),
    };
    const direct = await (await fetch(`${mock.url}/v1/messages`, init)).text();
    const viaGateway = await (
      await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
        ...init,
        headers: { ...init.headers, 'x-kaiden-key': TEST_KEY },
      })
    ).text();
    expect(viaGateway).toBe(direct);
  });
});

describe('openai passthrough', () => {
  it('non-streaming: real SDK round-trip, metadata event captured', async () => {
    const completion = await openaiClient().chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: SENTINEL_PROMPT }],
    });

    expect(completion.usage?.prompt_tokens).toBe(11);

    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.2',
      promptTokens: 11,
      completionTokens: 7,
      streaming: false,
      stopReason: 'stop',
    });

    const seen = mock.lastRequest();
    expect(seen?.headers.authorization).toBe('Bearer sk-openai-test-dummy');
    expect(seen?.headers['x-kaiden-key']).toBeUndefined();
  });

  it('streaming without include_usage: gateway injects it, client never sees the synthetic chunk', async () => {
    const stream = await openaiClient().chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: SENTINEL_PROMPT }],
      stream: true,
    });

    let sawUsageChunk = false;
    let content = '';
    for await (const chunk of stream) {
      if (chunk.usage) sawUsageChunk = true;
      content += chunk.choices[0]?.delta?.content ?? '';
    }
    expect(sawUsageChunk).toBe(false);
    expect(content).toContain('streamed');

    // ...but the upstream request DID carry the injected option,
    const upstreamBody = JSON.parse(mock.lastRequest()?.body ?? '{}');
    expect(upstreamBody.stream_options).toEqual({ include_usage: true });

    // ...and the gateway captured the token counts.
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0]).toMatchObject({
      provider: 'openai',
      promptTokens: 11,
      completionTokens: 7,
      streaming: true,
    });
  });

  it('streaming with injection: bytes identical to a direct call without usage', async () => {
    const body = JSON.stringify({ model: 'gpt-5.2', messages: [], stream: true });
    const direct = await (
      await fetch(`${mock.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
        body,
      })
    ).text();
    const viaGateway = await (
      await fetch(`${gatewayUrl}/openai/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer x',
          'x-kaiden-key': TEST_KEY,
        },
        body,
      })
    ).text();
    expect(viaGateway).toBe(direct);
  });

  it('streaming with client-requested usage: the usage chunk reaches the client', async () => {
    const response = await fetch(`${gatewayUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer x',
        'x-kaiden-key': TEST_KEY,
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        messages: [],
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    const text = await response.text();
    expect(text).toContain('"prompt_tokens":11');
  });
});

describe('plain passthrough', () => {
  it('proxies non-extractable endpoints without recording events', async () => {
    const response = await fetch(`${gatewayUrl}/openai/v1/models`, {
      headers: { 'x-kaiden-key': TEST_KEY, authorization: 'Bearer x' },
    });
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { object: string };
    expect(parsed.object).toBe('list');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(events.length).toBe(0);
  });

  it('captures the session hint header as metadata without forwarding it', async () => {
    await fetch(`${gatewayUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'k',
        'x-kaiden-key': TEST_KEY,
        'x-kaiden-session': 'session-abc',
      },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 8, messages: [] }),
    });
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0]?.sessionHint).toBe('session-abc');
    expect(mock.lastRequest()?.headers['x-kaiden-session']).toBeUndefined();
  });
});
