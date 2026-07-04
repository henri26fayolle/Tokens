import { parseSseFrame } from '../sse';
import { asArr, asNum, asObj, asStr } from './json';
import { type Extractor, emptyDraft, type StreamCollector } from './types';

/** Anthropic Messages API (/v1/messages). Usage is always present — no rewrite needed. */
export const anthropicMessages: Extractor = {
  parseResponseJson(value) {
    const draft = emptyDraft();
    const obj = asObj(value);
    if (!obj) return draft;
    draft.model = asStr(obj.model);
    draft.stopReason = asStr(obj.stop_reason);
    const usage = asObj(obj.usage);
    if (usage) {
      draft.promptTokens = asNum(usage.input_tokens);
      draft.completionTokens = asNum(usage.output_tokens);
    }
    for (const block of asArr(obj.content)) {
      if (asObj(block)?.type === 'tool_use') draft.toolCallCount += 1;
    }
    return draft;
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
        if (!obj) return true;
        switch (obj.type) {
          case 'message_start': {
            const message = asObj(obj.message);
            if (message) {
              draft.model = asStr(message.model) ?? draft.model;
              const usage = asObj(message.usage);
              if (usage) draft.promptTokens = asNum(usage.input_tokens) ?? draft.promptTokens;
            }
            break;
          }
          case 'content_block_start': {
            if (asObj(obj.content_block)?.type === 'tool_use') draft.toolCallCount += 1;
            break;
          }
          case 'message_delta': {
            const usage = asObj(obj.usage);
            if (usage) {
              draft.completionTokens = asNum(usage.output_tokens) ?? draft.completionTokens;
            }
            const delta = asObj(obj.delta);
            if (delta) draft.stopReason = asStr(delta.stop_reason) ?? draft.stopReason;
            break;
          }
          default:
            break;
        }
        return true;
      },
      result: () => draft,
    };
  },
};
