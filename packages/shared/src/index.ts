export const PROVIDERS = ['anthropic', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * Metadata captured per gateway request — the full list, and the only list.
 * The privacy contract (docs/architecture.md §3): nothing in this shape may
 * ever contain prompt/response content. The gateway privacy test suite
 * enforces the storage side of this promise.
 */
export interface UsageEventMeta {
  userId: string;
  ts: Date;
  provider: Provider;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  streaming: boolean;
  toolUse: boolean;
  toolCallCount: number;
  stopReason: string | null;
  latencyMs: number | null;
  userAgent: string | null;
  /** Client-supplied X-Kaiden-Session header, for turn-depth detection. */
  sessionHint: string | null;
  requestId: string | null;
}
