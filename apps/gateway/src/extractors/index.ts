import type { Provider } from '@kaiden/shared';
import { anthropicMessages } from './anthropic';
import { openaiChatCompletions, openaiResponses } from './openai';
import type { Extractor } from './types';

export type { Extractor, StreamCollector, UsageDraft } from './types';
export { emptyDraft } from './types';

/** Endpoints we extract usage from. Everything else passes through untouched. */
export function pickExtractor(provider: Provider, path: string): Extractor | null {
  if (provider === 'anthropic' && path === '/v1/messages') return anthropicMessages;
  if (provider === 'openai') {
    if (path.endsWith('/chat/completions')) return openaiChatCompletions;
    if (path.endsWith('/responses')) return openaiResponses;
  }
  return null;
}
