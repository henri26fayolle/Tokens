/**
 * Usage extractors read STRUCTURED usage/metadata fields from provider
 * responses as the bytes transit memory. They never persist, log, or return
 * message content — that is the privacy hard line (docs/architecture.md §3).
 */

export interface UsageDraft {
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  stopReason: string | null;
  toolCallCount: number;
}

export function emptyDraft(): UsageDraft {
  return {
    model: null,
    promptTokens: null,
    completionTokens: null,
    stopReason: null,
    toolCallCount: 0,
  };
}

export interface StreamCollector {
  /** Observe one SSE frame. Returns false to drop it from the client stream. */
  handleFrame(frame: Buffer): boolean;
  result(): UsageDraft;
}

export interface Extractor {
  /**
   * Optional request rewrite (e.g. OpenAI stream_options.include_usage
   * injection). Returns the new body, or null to leave the request untouched.
   */
  rewriteRequestBody?(body: Buffer): Buffer | null;
  parseResponseJson(value: unknown): UsageDraft;
  /** `injected` is true when rewriteRequestBody modified this request. */
  createStreamCollector(injected: boolean): StreamCollector;
}
