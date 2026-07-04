/**
 * The XP engine is pure: no I/O, config passed in, deterministic and
 * replayable (docs/architecture.md §5). Persistence lives in the processor
 * (apps/api/src/xp/processor.ts), which writes proposals idempotently.
 */
export { type ComputeUserInput, computeUser } from './engine';
export { levelForXp, rankForLevel, xpToReachLevel } from './levels';
export { addDays, diffDays, isValidTimezone, localDayOf, localHourOf } from './localday';
export { computeDay, streakBonusFor, usageXpFor } from './rules';
export type {
  DayAggregate,
  DayComputation,
  DayState,
  EngineEvent,
  LedgerProposal,
  UserComputation,
} from './types';
