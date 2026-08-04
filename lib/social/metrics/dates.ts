// Calendar arithmetic for the analytics engine. Pure and deterministic: every
// function takes an explicit `now`/`tz` and never reads the clock or the ambient
// timezone.
//
// This is the ONLY module in lib/social/metrics allowed to touch Intl. It is
// deterministic given a fixed IANA timezone string, which is what lets the rest
// of the engine stay trivially testable — and it is why the project needs no
// date library.

/** IANA timezone, e.g. "Asia/Kolkata". "UTC" is always safe. */
export type TimeZone = string;

export type Granularity = "day" | "week" | "month";
export type Period = "weekly" | "monthly" | "quarterly" | "annual";

export const DAY_MS = 86_400_000;

const partsCache = new Map<TimeZone, Intl.DateTimeFormat>();

function formatter(tz: TimeZone): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    partsCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday
}

/** Wall-clock fields of `d` as seen in `tz`. */
export function localParts(d: Date, tz: TimeZone): LocalParts {
  const parts = formatter(tz).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  if (hour === 24) hour = 0; // en-CA emits 24 for midnight in some engines
  const minute = get("minute");
  // Day-of-week from the local calendar date, so it is tz-correct.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

/** Local calendar date as yyyy-mm-dd — the key format used by every series. */
export function dayKey(d: Date, tz: TimeZone = "UTC"): string {
  const { year, month, day } = localParts(d, tz);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Local hour 0-23. */
export function localHour(d: Date, tz: TimeZone = "UTC"): number {
  return localParts(d, tz).hour;
}

/** Local day of week, 0 = Sunday. */
export function localWeekday(d: Date, tz: TimeZone = "UTC"): number {
  return localParts(d, tz).weekday;
}

/**
 * The UTC instant of local midnight starting `d`'s day in `tz`.
 *
 * Resolved by finding the offset at `d` and correcting once — a single
 * correction is enough for every real-world zone, including the half-hour and
 * 45-minute ones, and it handles DST transitions because the offset is sampled
 * at the target instant rather than assumed.
 */
export function startOfDay(d: Date, tz: TimeZone = "UTC"): Date {
  const { year, month, day } = localParts(d, tz);
  const naive = Date.UTC(year, month - 1, day);
  const offset = tzOffsetMs(new Date(naive), tz);
  const first = new Date(naive - offset);
  // Re-check: if the correction crossed a DST boundary the local date shifts.
  const check = localParts(first, tz);
  if (check.day === day && check.month === month && check.year === year && check.hour === 0) {
    return first;
  }
  return new Date(naive - tzOffsetMs(first, tz));
}

/** Milliseconds `tz` is ahead of UTC at instant `d`. */
export function tzOffsetMs(d: Date, tz: TimeZone): number {
  const { year, month, day, hour, minute } = localParts(d, tz);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Round to the minute: localParts has no seconds, so compare at minute grain.
  const actual = Math.floor(d.getTime() / 60_000) * 60_000;
  return asUtc - actual;
}

/** Local midnight on the Monday of `d`'s ISO week. */
export function startOfWeek(d: Date, tz: TimeZone = "UTC"): Date {
  const midnight = startOfDay(d, tz);
  const dow = localWeekday(midnight, tz);
  const backToMonday = (dow + 6) % 7; // Sunday(0) → 6, Monday(1) → 0
  return startOfDay(new Date(midnight.getTime() - backToMonday * DAY_MS), tz);
}

export function startOfMonth(d: Date, tz: TimeZone = "UTC"): Date {
  const { year, month } = localParts(d, tz);
  return startOfDay(new Date(Date.UTC(year, month - 1, 1, 12)), tz);
}

export function startOfQuarter(d: Date, tz: TimeZone = "UTC"): Date {
  const { year, month } = localParts(d, tz);
  const qMonth = Math.floor((month - 1) / 3) * 3;
  return startOfDay(new Date(Date.UTC(year, qMonth, 1, 12)), tz);
}

export function startOfYear(d: Date, tz: TimeZone = "UTC"): Date {
  const { year } = localParts(d, tz);
  return startOfDay(new Date(Date.UTC(year, 0, 1, 12)), tz);
}

/** ISO-8601 week number and its week-year (they differ near January). */
export function isoWeek(d: Date, tz: TimeZone = "UTC"): { year: number; week: number } {
  const monday = startOfWeek(d, tz);
  const { year, month, day } = localParts(monday, tz);
  // Thursday of this week determines the ISO week-year.
  const thursday = new Date(Date.UTC(year, month - 1, day + 3));
  const isoYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / (7 * DAY_MS)) + 1;
  return { year: isoYear, week };
}

/** "2026-W31" — stable, sortable, and usable as an idempotency key. */
export function isoWeekKey(d: Date, tz: TimeZone = "UTC"): string {
  const { year, week } = isoWeek(d, tz);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Every yyyy-mm-dd from `from` to `to`, inclusive of both local days. */
export function eachDay(from: Date, to: Date, tz: TimeZone = "UTC"): string[] {
  const out: string[] = [];
  if (to.getTime() < from.getTime()) return out;
  let cursor = startOfDay(from, tz);
  const last = dayKey(to, tz);
  // Bounded so a bad range can never spin: 10 years is far beyond any retention.
  for (let guard = 0; guard < 3700; guard += 1) {
    const key = dayKey(cursor, tz);
    out.push(key);
    if (key >= last) break;
    // Step 26h then re-normalise, so DST days (23h or 25h) still advance exactly one.
    cursor = startOfDay(new Date(cursor.getTime() + 26 * 3_600_000), tz);
  }
  return out;
}

export interface PeriodBounds {
  /** Inclusive start instant. */
  from: Date;
  /** Exclusive end instant. */
  to: Date;
  label: string;
}

/**
 * The most recent COMPLETE period of the given kind before `now`. Reports cover
 * finished periods — a "monthly report" run on the 3rd means last month, not
 * three days of this one.
 */
export function periodBounds(period: Period, now: Date, tz: TimeZone = "UTC"): PeriodBounds {
  switch (period) {
    case "weekly": {
      const thisWeek = startOfWeek(now, tz);
      const from = startOfWeek(new Date(thisWeek.getTime() - DAY_MS), tz);
      return { from, to: thisWeek, label: isoWeekKey(from, tz) };
    }
    case "monthly": {
      const thisMonth = startOfMonth(now, tz);
      const from = startOfMonth(new Date(thisMonth.getTime() - DAY_MS), tz);
      const p = localParts(from, tz);
      return { from, to: thisMonth, label: `${p.year}-${String(p.month).padStart(2, "0")}` };
    }
    case "quarterly": {
      const thisQuarter = startOfQuarter(now, tz);
      const from = startOfQuarter(new Date(thisQuarter.getTime() - DAY_MS), tz);
      const p = localParts(from, tz);
      return { from, to: thisQuarter, label: `${p.year}-Q${Math.floor((p.month - 1) / 3) + 1}` };
    }
    case "annual": {
      const thisYear = startOfYear(now, tz);
      const from = startOfYear(new Date(thisYear.getTime() - DAY_MS), tz);
      return { from, to: thisYear, label: `${localParts(from, tz).year}` };
    }
  }
}

/** The equal-length window immediately before `bounds` — the comparison basis. */
export function previousPeriod(bounds: PeriodBounds): PeriodBounds {
  const span = bounds.to.getTime() - bounds.from.getTime();
  return {
    from: new Date(bounds.from.getTime() - span),
    to: bounds.from,
    label: `${bounds.label} (previous)`,
  };
}

/** A trailing N-day window ending at `now`. */
export function rangeBounds(rangeDays: number, now: Date): PeriodBounds {
  return {
    from: new Date(now.getTime() - rangeDays * DAY_MS),
    to: now,
    label: `${rangeDays}d`,
  };
}

/** The bucket key a date falls into at a given granularity. */
export function bucketKey(d: Date, granularity: Granularity, tz: TimeZone = "UTC"): string {
  if (granularity === "day") return dayKey(d, tz);
  if (granularity === "week") return dayKey(startOfWeek(d, tz), tz);
  return dayKey(startOfMonth(d, tz), tz);
}

/** Half-open containment: `from <= d < to`. */
export function within(d: Date | null | undefined, from: Date, to: Date): boolean {
  if (!d) return false;
  const t = d.getTime();
  return t >= from.getTime() && t < to.getTime();
}

/** Whole days spanned, at least 1 — the denominator for per-day rates. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}
