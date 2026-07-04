import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Sentinels: if these ever show up in logs or stored events, privacy is broken. */
export const SENTINEL_PROMPT = 'SENTINEL_PROMPT_2a7f';
export const SENTINEL_RESPONSE = 'SENTINEL_RESPONSE_9c3b';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: string;
}

const ANTHROPIC_JSON = {
  id: 'msg_mock_01',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5',
  content: [
    { type: 'text', text: `${SENTINEL_RESPONSE} hello from mock` },
    { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: { city: 'Osaka' } },
  ],
  stop_reason: 'tool_use',
  stop_sequence: null,
  usage: { input_tokens: 17, output_tokens: 5 },
};

const ANTHROPIC_SSE = [
  `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_mock_02","type":"message","role":"assistant","model":"claude-sonnet-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":17,"output_tokens":1}}}\n\n`,
  `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
  `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${SENTINEL_RESPONSE} streamed"}}\n\n`,
  `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`,
  `event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_02","name":"get_weather","input":{}}}\n\n`,
  `event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n`,
  `event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n`,
  `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":9}}\n\n`,
  `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
].join('');

const OPENAI_CHAT_JSON = {
  id: 'chatcmpl-mock-1',
  object: 'chat.completion',
  created: 1_751_600_000,
  model: 'gpt-5.2',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: `${SENTINEL_RESPONSE} from openai mock` },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
};

function openaiChatSse(includeUsage: boolean): string {
  const frames = [
    `data: {"id":"chatcmpl-mock-2","object":"chat.completion.chunk","created":1751600001,"model":"gpt-5.2","choices":[{"index":0,"delta":{"role":"assistant","content":"${SENTINEL_RESPONSE} "},"finish_reason":null}]}\n\n`,
    `data: {"id":"chatcmpl-mock-2","object":"chat.completion.chunk","created":1751600001,"model":"gpt-5.2","choices":[{"index":0,"delta":{"content":"streamed"},"finish_reason":null}]}\n\n`,
    `data: {"id":"chatcmpl-mock-2","object":"chat.completion.chunk","created":1751600001,"model":"gpt-5.2","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
  ];
  if (includeUsage) {
    frames.push(
      `data: {"id":"chatcmpl-mock-2","object":"chat.completion.chunk","created":1751600001,"model":"gpt-5.2","choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}\n\n`,
    );
  }
  frames.push('data: [DONE]\n\n');
  return frames.join('');
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

/** Writes SSE in two awkward halves (splitting mid-frame) to exercise buffering. */
function writeSse(response: ServerResponse, payload: string): void {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': 'req_mock_1' });
  const bytes = Buffer.from(payload, 'utf8');
  const split = Math.floor(bytes.length / 2) + 3;
  response.write(bytes.subarray(0, split));
  setTimeout(() => {
    response.write(bytes.subarray(split));
    response.end();
  }, 5);
}

function writeJson(response: ServerResponse, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.writeHead(200, {
    'content-type': 'application/json',
    'content-length': String(body.length),
    'request-id': 'req_mock_1',
  });
  response.end(body);
}

/** A fake Anthropic/OpenAI origin with canned, deterministic responses. */
export class MockUpstream {
  readonly requests: RecordedRequest[] = [];
  url = '';
  private server: Server | null = null;

  async start(): Promise<void> {
    this.server = createServer(async (request, response) => {
      const body = await readBody(request);
      const path = (request.url ?? '/').split('?')[0] ?? '/';
      this.requests.push({ method: request.method ?? '', path, headers: request.headers, body });

      // Test-only echoes so tests can assert header hygiene end-to-end.
      response.setHeader(
        'x-mock-auth',
        String(request.headers.authorization ?? request.headers['x-api-key'] ?? 'none'),
      );
      response.setHeader('x-mock-kaiden', request.headers['x-kaiden-key'] ? 'leaked' : 'absent');

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(body) as Record<string, unknown>;
      } catch {
        // GET requests etc.
      }

      if (request.method === 'POST' && path === '/v1/messages') {
        if (parsed.stream === true) return writeSse(response, ANTHROPIC_SSE);
        return writeJson(response, ANTHROPIC_JSON);
      }
      if (request.method === 'POST' && path === '/v1/chat/completions') {
        if (parsed.stream === true) {
          const options = parsed.stream_options as Record<string, unknown> | undefined;
          return writeSse(response, openaiChatSse(options?.include_usage === true));
        }
        return writeJson(response, OPENAI_CHAT_JSON);
      }
      if (request.method === 'GET' && path === '/v1/models') {
        return writeJson(response, { object: 'list', data: [{ id: 'gpt-5.2', object: 'model' }] });
      }
      return writeJson(response, { error: { message: 'mock: unknown route' } });
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', resolve);
    });
    const address = this.server?.address() as AddressInfo;
    this.url = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
  }

  lastRequest(): RecordedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }
}
