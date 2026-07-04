/**
 * ALL XP constants live here — never in engine code (hard rule, see CLAUDE.md).
 * Rebalancing is a change to this file plus a version bump; every xp_ledger row
 * records the version that produced it, and earned XP is never clawed back.
 *
 * Values marked ⚠ are v1 drafts pending the M2 calibration pass.
 * Source of truth for the numbers: kaiden-product-brief.md §6–§7.
 */

export interface XpConfig {
  version: string;
  season: {
    /** Season id stamped on xp_ledger rows from day one (brief §7). */
    current: string;
  };
  daily: {
    activeDayXp: number;
    usageXpDailyCap: number;
    usageXpScale: number;
    usageXpTokenUnit: number;
    usageHardCap: number;
  };
  streak: {
    xpPerStreakDay: number;
    bonusCap: number;
  };
  behavior: {
    /** One-time: first event ever through the gateway (activation reward). */
    connectedXp: number;
    firstNewProviderXp: number;
    firstNewModelXp: number;
    multiProviderDayXp: number;
    toolUseSessionXp: number;
    deepSessionXp: number;
    deepSessionMinTurns: number;
  };
  social: {
    publishWazaXp: number;
    kudosReceivedXp: number;
    kudosDecayAfter: number;
    wazaCopiedXp: number;
  };
  levels: {
    base: number;
    exponent: number;
    /**
     * 'offset-one': cumulative XP to reach level L = base × (L−1)^exponent.
     * Chosen over the brief's literal `L^exponent` so "level 2 in the first
     * session" is actually reachable — see docs/architecture.md §5. ⚠ M2
     */
    indexing: 'offset-one' | 'literal';
  };
  /** kyū/dan ladder (brief §4), minLevel ascending. ⚠ placeholder mapping — M2 */
  ranks: ReadonlyArray<{ minLevel: number; label: string }>;
  /** Achievement definitions v1 — behavioral over volumetric (brief §12). Grants live in DB. ⚠ M2 */
  achievements: ReadonlyArray<{ id: string; name: string; description: string; xp: number }>;
}

export const XP_CONFIG: XpConfig = {
  version: '2026.07.1',
  season: {
    current: '2026Q3',
  },
  daily: {
    /** ≥1 real session that day (brief: 30 XP) */
    activeDayXp: 30,
    /** log-scaled usage XP ceiling (brief: 60 XP/day) */
    usageXpDailyCap: 60,
    /**
     * usageXp = min(cap, round(scale × ln(1 + totalTokens / tokenUnit)))
     * M2 calibration: 50k tokens/day (real enthusiast) ≈ 42 XP; the 60 cap
     * needs ~450k tokens; a 10M-token bot pins the cap. See simulation tests.
     */
    usageXpScale: 8,
    usageXpTokenUnit: 250,
    /** hard ceiling on all usage-derived XP per day; streak bonus sits OUTSIDE this */
    usageHardCap: 150,
  },
  streak: {
    /** +2 XP × current streak length… */
    xpPerStreakDay: 2,
    /** …capped at +60 (a 30-day streak maxes the bonus) */
    bonusCap: 60,
  },
  behavior: {
    /**
     * M2 calibration: without this, a realistic single-provider first session
     * peaks ~187 XP — short of the 200 needed for the brief's "level 2 in the
     * first session" target. Rewarding completed activation closes the gap.
     */
    connectedXp: 25,
    firstNewProviderXp: 40,
    firstNewModelXp: 40,
    /** max once/day */
    multiProviderDayXp: 25,
    /** max once/day */
    toolUseSessionXp: 20,
    /** max once/day */
    deepSessionXp: 20,
    deepSessionMinTurns: 10,
  },
  /** Phase 2 — present so the economy is complete on paper; nothing awards these yet. */
  social: {
    publishWazaXp: 100,
    kudosReceivedXp: 5,
    /** per post, kudos XP decays after this many */
    kudosDecayAfter: 100,
    wazaCopiedXp: 15,
  },
  levels: {
    base: 200,
    exponent: 1.6,
    indexing: 'offset-one',
  },
  ranks: [
    { minLevel: 1, label: '9-kyū' },
    { minLevel: 2, label: '8-kyū' },
    { minLevel: 3, label: '7-kyū' },
    { minLevel: 4, label: '6-kyū' },
    { minLevel: 5, label: '5-kyū' },
    { minLevel: 6, label: '4-kyū' },
    { minLevel: 7, label: '3-kyū' },
    { minLevel: 8, label: '2-kyū' },
    { minLevel: 9, label: '1-kyū' },
    { minLevel: 10, label: '1-dan' },
    { minLevel: 13, label: '2-dan' },
    { minLevel: 17, label: '3-dan' },
    { minLevel: 22, label: '4-dan' },
    { minLevel: 28, label: '5-dan' },
    { minLevel: 35, label: '6-dan' },
    { minLevel: 43, label: '7-dan' },
    { minLevel: 52, label: '8-dan' },
    { minLevel: 62, label: '9-dan' },
  ],
  achievements: [
    { id: 'polyglot', name: 'Polyglot', description: 'Use 3 providers in one day', xp: 25 },
    {
      id: 'night-shift',
      name: 'Night Shift',
      description: 'A real session after midnight',
      xp: 25,
    },
    { id: 'marathon', name: 'Marathon', description: 'A single thread 25+ turns deep', xp: 25 },
    {
      id: 'early-adopter',
      name: 'Early Adopter',
      description: 'Use a model within 7 days of Kaiden first seeing it',
      xp: 25,
    },
    { id: 'comeback', name: 'Comeback', description: 'Return after 14+ days away', xp: 25 },
  ],
};

export const CONFIG_VERSION = XP_CONFIG.version;
