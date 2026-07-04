/**
 * The XP engine is pure: no I/O, config passed in, deterministic and
 * replayable (docs/architecture.md §5). M0 ships the level curve; M2 adds the
 * event → ledger pipeline (rules, streaks, daily caps, achievements).
 */
export { levelForXp, rankForLevel, xpToReachLevel } from './levels';
