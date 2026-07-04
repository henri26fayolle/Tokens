/** Tiny safe accessors for spelunking untyped provider JSON. */

export type Json = Record<string, unknown>;

export function asObj(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null;
}

export function asArr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
