import type { XpConfig } from '@kaiden/xp-config';

const MAX_LEVEL = 999;

/** Cumulative lifetime XP required to reach `level`. Level 1 is the floor: 0 XP. */
export function xpToReachLevel(level: number, config: XpConfig): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`invalid level: ${level}`);
  }
  if (level === 1) return 0;
  const { base, exponent, indexing } = config.levels;
  const n = indexing === 'offset-one' ? level - 1 : level;
  return Math.round(base * n ** exponent);
}

export function levelForXp(xp: number, config: XpConfig): number {
  if (!Number.isFinite(xp) || xp < 0) {
    throw new RangeError(`invalid xp: ${xp}`);
  }
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpToReachLevel(level + 1, config)) {
    level += 1;
  }
  return level;
}

export function rankForLevel(level: number, config: XpConfig): string {
  let label = config.ranks[0]?.label ?? '9-kyū';
  for (const rank of config.ranks) {
    if (level >= rank.minLevel) {
      label = rank.label;
    } else {
      break;
    }
  }
  return label;
}
