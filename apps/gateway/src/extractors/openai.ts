import { parseSseFrame } from '../sse';
import { asArr, asNum, asObj, asStr } from './json';
import { type Extractor, emptyDraft, type StreamCollector } from './types';

/**
 * OpenAI Chat Completions (/v1/chat/completions).
 *
 * Streamed responses only report usage when the client asks via
 * stream_options.include_usage. If the client didn't ask, the gateway asks on
 * its behalf and swallows the resulting synthetic final chunk, so the client
 * receives exactly the stream shape it requested (docs/architecture.md §3).
 */
export const openaiChatCompletions: Extractor = {
  rewriteRequestBody(body) {
    let value: unknown;
    try {
      value = JSON.parse(body.toString('utf8'));
    } catch {
      return null;
    }
    const obj = asObj(value);
    if (obj?.stream !== true) return null;
    const streamOptions = asObj(obj.stream_options);
    if (streamOptions?.include_usage === true) return null;
    obj.stream_options = { ...(streamOptions ?? {}), include_usage: true };
    return Buffer.from(JSON.stringify(obj), 'utf8');
  },

  parseResponseJson(value) {
    const draft = emptyDraft();
    const obj = asObj(value);
    if (!obj) return draft;
    draft.model = asStr(obj.model);
    const usage = asObj(obj.usage);
    if (usage) {
      draft.promptTokens = asNum(usage.prompt_tokens);
      draft.completionTokens = asNum(usage.completion_tokens);
    }
    const choice = asObj(asArr(obj.choices)[0]);
    if (choice) {
      draft.stopReason = asStr(choice.finish_reason);
      draft.toolCallCount = asArr(asObj(choice.message)?.tool_calls).length;
    }
    return draft;
  },

  createStreamCollector(injected): StreamCollector {
    const draft = emptyDraft();
    const toolIndexes = new Set<string>();
    return {
      handleFrame(frame) {
        const { data } = parseSseFrame(frame);
        if (!data || data.trim() === '[DONE]') return true;
        let value: unknown;
        try {
          value = JSON.parse(data);
        } catch {
          return true;
        }
        const obj = asObj(value);
        if (!obj) return true;
        draft.model = draft.model ?? asStr(obj.model);
        for (const item of asArr(obj.choices)) {
          const choice = asObj(item);
          if (!choice) continue;
          const finish = asStr(choice.finish_reason);
          if (finish) draft.stopReason = finish;
          for (const call of asArr(asObj(choice.delta)?.tool_calls)) {
            const toolCall = asObj(call);
            if (!toolCall) continue;
            const index = asNum(toolCall.index);
            toolIndexes.add(index !== null ? `i${index}` : (asStr(toolCall.id) ?? 'unknown'));
          }
        }
        draft.toolCallCount = toolIndexes.size;
        const usage = asObj(obj.usage);
        if (usage) {
          draft.promptTokens = asNum(usage.prompt_tokens) ?? draft.promptTokens;
          draft.completionTokens = asNum(usage.completion_tokens) ?? draft.completionTokens;
          // The synthetic usage-only chunk exists because WE injected the
          // option; the client didn't ask for it, so it must not see it.
          if (injected && asArr(obj.choices).length === 0) return false;
        }
        return true;
      },
      result: () => draft,
    };
  },
};

/**
 * OpenAI Responses API (/v1/responses). Usage always arrives in the
 * response.completed event — no rewrite needed.
 */
export const openaiResponses: Extractor = {
  parseResponseJson(value) {
    const draft = emptyDraft();
    const obj = asObj(value);
    if (!obj) return draft;
    return readResponseObject(obj, draft);
  },

  createStreamCollector(): StreamCollector {
    const draft = emptyDraft();
    return {
      handleFrame(frame) {
        const { data } = parseSseFrame(frame);
        if (!data) return true;
        let value: unknown;
        try {
          value = JSON.parse(data);
        } catch {
          return true;
        }
        const obj = asObj(value);
        if (obj?.type === 'response.completed') {
          const response = asObj(obj.response);
          if (response) readResponseObject(response, draft);
        }
        return true;
      },
      result: () => draft,
    };
  },
};

function readResponseObject(
  obj: Record<string, unknown>,
  draft: ReturnType<typeof emptyDraft>,
): ReturnType<typeof emptyDraft> {
  draft.model = asStr(obj.model) ?? draft.model;
  draft.stopReason = asStr(obj.status) ?? draft.stopReason;
  const usage = asObj(obj.usage);
  if (usage) {
    draft.promptTokens = asNum(usage.input_tokens) ?? draft.promptTokens;
    draft.completionTokens = asNum(usage.output_tokens) ?? draft.completionTokens;
  }
  let toolCalls = 0;
  for (const item of asArr(obj.output)) {
    if (asObj(item)?.type === 'function_call') toolCalls += 1;
  }
  if (toolCalls > 0) draft.toolCallCount = toolCalls;
  return draft;
}
