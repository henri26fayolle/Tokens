import { describe, expect, it } from 'vitest';
import { createSseFrameTransform, parseSseFrame } from '../sse';
import { anthropicMessages } from './anthropic';
import { openaiChatCompletions } from './openai';

const ANTHROPIC_SSE = [
  `event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-5","usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
  `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
  `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n`,
  `event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"f","input":{}}}\n\n`,
  `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":9}}\n\n`,
  `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
].join('');

/** Deterministic PRNG so chunking tests can't flake. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function runThroughTransform(
  input: Buffer,
  onFrame: (frame: Buffer) => boolean,
  nextChunkSize: () => number,
): Promise<Buffer> {
  const transform = createSseFrameTransform(onFrame);
  const output: Buffer[] = [];
  transform.on('data', (chunk: Buffer) => output.push(chunk));
  const done = new Promise<void>((resolve) => transform.once('end', resolve));
  let offset = 0;
  while (offset < input.length) {
    const size = Math.max(1, nextChunkSize());
    transform.write(input.subarray(offset, offset + size));
    offset += size;
  }
  transform.end();
  await done;
  return Buffer.concat(output);
}

describe('SSE frame transform', () => {
  it('is byte-exact under adversarial chunking (5 deterministic seeds)', async () => {
    const input = Buffer.from(ANTHROPIC_SSE, 'utf8');
    for (const seed of [1, 7, 42, 1337, 99999]) {
      const random = mulberry32(seed);
      const collector = anthropicMessages.createStreamCollector(false);
      const output = await runThroughTransform(
        input,
        (frame) => collector.handleFrame(frame),
        () => Math.ceil(random() * 11),
      );
      expect(output.equals(input)).toBe(true);
      const draft = collector.result();
      expect(draft).toEqual({
        model: 'claude-sonnet-5',
        promptTokens: 17,
        completionTokens: 9,
        stopReason: 'tool_use',
        toolCallCount: 1,
      });
    }
  });

  it('handles CRLF frame delimiters', async () => {
    const input = Buffer.from(ANTHROPIC_SSE.replaceAll('\n', '\r\n'), 'utf8');
    const collector = anthropicMessages.createStreamCollector(false);
    const output = await runThroughTransform(
      input,
      (frame) => collector.handleFrame(frame),
      () => 9,
    );
    expect(output.equals(input)).toBe(true);
    expect(collector.result().promptTokens).toBe(17);
  });

  it('flushes an unterminated trailing frame', async () => {
    const input = Buffer.from('data: {"type":"message_stop"}', 'utf8');
    const output = await runThroughTransform(
      input,
      () => true,
      () => 4,
    );
    expect(output.equals(input)).toBe(true);
  });
});

describe('parseSseFrame', () => {
  it('joins multiple data lines per the SSE spec', () => {
    const { event, data } = parseSseFrame(Buffer.from('event: x\ndata: a\ndata: b\n\n'));
    expect(event).toBe('x');
    expect(data).toBe('a\nb');
  });
});

describe('OpenAI stream_options injection', () => {
  const rewrite = (body: unknown): Buffer | null =>
    openaiChatCompletions.rewriteRequestBody?.(Buffer.from(JSON.stringify(body))) ?? null;

  it('injects include_usage into streaming requests', () => {
    const rewritten = rewrite({ model: 'gpt-5.2', stream: true, messages: [] });
    expect(rewritten).not.toBeNull();
    expect(JSON.parse(String(rewritten))).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('preserves other stream_options fields', () => {
    const rewritten = rewrite({ stream: true, stream_options: { other: 1 } });
    expect(JSON.parse(String(rewritten))).toMatchObject({
      stream_options: { other: 1, include_usage: true },
    });
  });

  it('leaves non-streaming requests untouched', () => {
    expect(rewrite({ model: 'gpt-5.2', stream: false })).toBeNull();
    expect(rewrite({ model: 'gpt-5.2' })).toBeNull();
  });

  it('leaves requests alone when the client already asked for usage', () => {
    expect(rewrite({ stream: true, stream_options: { include_usage: true } })).toBeNull();
  });

  it('leaves non-JSON bodies untouched', () => {
    expect(openaiChatCompletions.rewriteRequestBody?.(Buffer.from('not json'))).toBeNull();
  });
});

describe('OpenAI stream collector', () => {
  const usageFrame = Buffer.from(
    'data: {"model":"gpt-5.2","choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7}}\n\n',
  );
  const doneFrame = Buffer.from('data: [DONE]\n\n');

  it('swallows the synthetic usage chunk when the gateway injected it', () => {
    const collector = openaiChatCompletions.createStreamCollector(true);
    expect(collector.handleFrame(usageFrame)).toBe(false);
    expect(collector.handleFrame(doneFrame)).toBe(true);
    expect(collector.result()).toMatchObject({ promptTokens: 11, completionTokens: 7 });
  });

  it('passes the usage chunk through when the client asked for it', () => {
    const collector = openaiChatCompletions.createStreamCollector(false);
    expect(collector.handleFrame(usageFrame)).toBe(true);
    expect(collector.result()).toMatchObject({ promptTokens: 11, completionTokens: 7 });
  });

  it('counts distinct tool calls across deltas', () => {
    const collector = openaiChatCompletions.createStreamCollector(false);
    const frame = (payload: unknown) => Buffer.from(`data: ${JSON.stringify(payload)}\n\n`);
    collector.handleFrame(
      frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'a' }] } }] }),
    );
    collector.handleFrame(
      frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0 }] } }] }),
    );
    collector.handleFrame(
      frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: 'b' }] } }] }),
    );
    expect(collector.result().toolCallCount).toBe(2);
  });
});
