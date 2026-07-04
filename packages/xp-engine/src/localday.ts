/**
 * User-local day arithmetic via Intl — no timezone dependency. Streaks and
 * "active day" are user-local-midnight concepts (docs/architecture.md §4).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

function parts(ts: Date, timezone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of formatterFor(timezone).formatToParts(ts)) {
    out[part.type] = part.value;
  }
  return out;
}

/** YYYY-MM-DD in the user's timezone. Throws on invalid timezone (caller validates). */
export function localDayOf(ts: Date, timezone: string): string {
  const p = parts(ts, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 0–23 hour in the user's timezone. */
export function localHourOf(ts: Date, timezone: string): number {
  return Number(parts(ts, timezone).hour);
}

function toUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

export function addDays(day: string, delta: number): string {
  const d = new Date(toUtcMs(day) + delta * 86_400_000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** Whole days from `earlier` to `later` (positive when later > earlier). */
export function diffDays(later: string, earlier: string): number {
  return Math.round((toUtcMs(later) - toUtcMs(earlier)) / 86_400_000);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
}
