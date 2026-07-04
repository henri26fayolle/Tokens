/** The subset of a usage_events row the engine needs. Metadata only, as ever. */
export interface EngineEvent {
  id: number;
  ts: Date;
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  toolUse: boolean;
  /** X-Kaiden-Session value; turn depth = events sharing a hint in a day. */
  sessionHint: string | null;
}

/**
 * A proposed append-only xp_ledger row. The idempotency key is fully
 * deterministic (userId + rule + scope), so persisting proposals with
 * ON CONFLICT DO NOTHING makes reprocessing — incremental or from-scratch —
 * converge on the identical ledger. That property is what makes "never claw
 * back, always replayable" real; don't break it.
 */
export interface LedgerProposal {
  ruleId: string;
  amount: number;
  /** User-local day (YYYY-MM-DD) the XP belongs to. */
  day: string;
  idempotencyKey: string;
}

/**
 * A postable feed item (Phase 2 seed, brief §8): notable sessions captured
 * with metadata chips and pre-drafted copy. Metadata/draft are built ONLY
 * from usage metadata — never from conversation content. Idempotency keys
 * are deterministic; persistence upserts (converge-to-latest replay).
 */
export interface MomentProposal {
  kind: 'deep-session' | 'marathon' | 'new-model';
  day: string;
  ts: Date;
  metadata: Record<string, unknown>;
  draftCopy: string;
  idempotencyKey: string;
}

/** Mirrors the daily_activity row for one user-local day. */
export interface DayAggregate {
  day: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  providers: string[];
  models: string[];
  toolUseSession: boolean;
  deepSession: boolean;
  usageXpAwarded: number;
}

/** State carried into a day's computation (all derivable by full replay). */
export interface DayState {
  userId: string;
  timezone: string;
  /** Streak as of the previous active day (0 if none). */
  priorStreak: number;
  /** Most recent active day strictly before this one, if any. */
  lastActiveDay: string | null;
  /** True until the user's very first event has been rewarded. */
  neverConnected: boolean;
  knownProviders: ReadonlySet<string>;
  /** Keys are `${provider}/${model}`. */
  knownModels: ReadonlySet<string>;
  grantedAchievements: ReadonlySet<string>;
}

export interface DayComputation {
  ledger: LedgerProposal[];
  /** Achievement ids newly earned this day (XP rows are already in `ledger`). */
  achievements: string[];
  /** Streak value for this day. */
  streak: number;
  aggregate: DayAggregate;
  moments: MomentProposal[];
}

export interface UserComputation {
  ledger: LedgerProposal[];
  achievements: string[];
  days: DayAggregate[];
  moments: MomentProposal[];
  lastActiveDay: string | null;
  currentStreak: number;
  longestStreak: number;
  /** Sum of all proposed amounts — equals the DB sum after idempotent insert. */
  lifetimeXp: number;
}
