import { XP_CONFIG } from '@kaiden/xp-config';
import { describe, expect, it } from 'vitest';
import { levelForXp, rankForLevel, xpToReachLevel } from './levels';

describe('level curve — calibration guards (docs/architecture.md §5)', () => {
  it('level 2 costs 200 XP, reachable in the first session', () => {
    expect(xpToReachLevel(2, XP_CONFIG)).toBe(200);
  });

  it('a consistent month (~180 XP/day) lands in the brief’s level 8–9 band', () => {
    const monthXp = 180 * 30;
    expect(levelForXp(monthXp, XP_CONFIG)).toBeGreaterThanOrEqual(8);
    expect(levelForXp(monthXp, XP_CONFIG)).toBeLessThanOrEqual(9);
  });

  it('is strictly monotonic', () => {
    for (let level = 1; level < 60; level += 1) {
      expect(xpToReachLevel(level + 1, XP_CONFIG)).toBeGreaterThan(
        xpToReachLevel(level, XP_CONFIG),
      );
    }
  });

  it('levelForXp inverts xpToReachLevel at the boundaries', () => {
    for (let level = 1; level <= 30; level += 1) {
      const threshold = xpToReachLevel(level, XP_CONFIG);
      expect(levelForXp(threshold, XP_CONFIG)).toBe(level);
      if (level > 1) {
        expect(levelForXp(threshold - 1, XP_CONFIG)).toBe(level - 1);
      }
    }
  });

  it('rejects nonsense inputs', () => {
    expect(() => xpToReachLevel(0, XP_CONFIG)).toThrow(RangeError);
    expect(() => xpToReachLevel(1.5, XP_CONFIG)).toThrow(RangeError);
    expect(() => levelForXp(-1, XP_CONFIG)).toThrow(RangeError);
  });
});

describe('kyū/dan mapping', () => {
  it('a new user is 9-kyū', () => {
    expect(rankForLevel(1, XP_CONFIG)).toBe('9-kyū');
  });

  it('level 9 reaches 1-kyū', () => {
    expect(rankForLevel(9, XP_CONFIG)).toBe('1-kyū');
  });

  it('level 10 enters the dan ranks', () => {
    expect(rankForLevel(10, XP_CONFIG)).toBe('1-dan');
  });

  it('deep levels cap at 9-dan', () => {
    expect(rankForLevel(100, XP_CONFIG)).toBe('9-dan');
  });
});
