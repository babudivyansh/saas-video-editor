import { describe, it, expect } from "vitest";
import {
  bucketKey,
  dayKey,
  daysBetween,
  eachDay,
  isoWeek,
  isoWeekKey,
  localParts,
  localWeekday,
  periodBounds,
  previousPeriod,
  rangeBounds,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  tzOffsetMs,
  within,
} from "./dates";

const IST = "Asia/Kolkata"; // UTC+5:30, no DST — exercises half-hour offsets
const NY = "America/New_York"; // DST
const NPL = "Asia/Kathmandu"; // UTC+5:45 — the 45-minute case

describe("localParts", () => {
  it("reads wall-clock fields in the target zone", () => {
    const d = new Date("2026-08-03T18:30:00Z");
    expect(localParts(d, "UTC")).toMatchObject({ year: 2026, month: 8, day: 3, hour: 18 });
    expect(localParts(d, IST)).toMatchObject({ year: 2026, month: 8, day: 4, hour: 0, minute: 0 });
  });

  it("handles 45-minute offsets", () => {
    const d = new Date("2026-08-03T18:30:00Z");
    expect(localParts(d, NPL)).toMatchObject({ day: 4, hour: 0, minute: 15 });
  });

  it("derives weekday from the local date, not the UTC date", () => {
    // 22:00 Sunday UTC is already Monday in IST.
    const d = new Date("2026-08-02T22:00:00Z");
    expect(localWeekday(d, "UTC")).toBe(0);
    expect(localWeekday(d, IST)).toBe(1);
  });
});

describe("dayKey", () => {
  it("formats yyyy-mm-dd", () => {
    expect(dayKey(new Date("2026-01-05T12:00:00Z"), "UTC")).toBe("2026-01-05");
  });

  it("rolls the date over at the local, not UTC, boundary", () => {
    const d = new Date("2026-08-03T19:00:00Z");
    expect(dayKey(d, "UTC")).toBe("2026-08-03");
    expect(dayKey(d, IST)).toBe("2026-08-04");
  });

  it("sorts lexicographically in chronological order", () => {
    const keys = ["2026-12-01", "2026-01-05", "2026-02-28"].sort();
    expect(keys).toEqual(["2026-01-05", "2026-02-28", "2026-12-01"]);
  });
});

describe("tzOffsetMs", () => {
  it("measures the offset in whole and half hours", () => {
    const d = new Date("2026-08-03T12:00:00Z");
    expect(tzOffsetMs(d, "UTC")).toBe(0);
    expect(tzOffsetMs(d, IST)).toBe(5.5 * 3_600_000);
  });

  it("tracks DST", () => {
    const summer = tzOffsetMs(new Date("2026-07-01T12:00:00Z"), NY);
    const winter = tzOffsetMs(new Date("2026-01-01T12:00:00Z"), NY);
    expect(summer).toBe(-4 * 3_600_000);
    expect(winter).toBe(-5 * 3_600_000);
  });
});

describe("startOfDay", () => {
  it("returns the instant of local midnight", () => {
    const d = new Date("2026-08-03T18:30:00Z"); // 2026-08-04 00:00 IST
    expect(startOfDay(d, IST).toISOString()).toBe("2026-08-03T18:30:00.000Z");
  });

  it("is idempotent", () => {
    const d = new Date("2026-08-03T07:12:44Z");
    const once = startOfDay(d, IST);
    expect(startOfDay(once, IST).getTime()).toBe(once.getTime());
  });

  it("lands on local midnight across a DST spring-forward", () => {
    // US DST begins 2026-03-08.
    const d = new Date("2026-03-08T18:00:00Z");
    const sod = startOfDay(d, NY);
    expect(localParts(sod, NY)).toMatchObject({ year: 2026, month: 3, day: 8, hour: 0 });
  });

  it("lands on local midnight across a DST fall-back", () => {
    const d = new Date("2026-11-01T18:00:00Z");
    const sod = startOfDay(d, NY);
    expect(localParts(sod, NY)).toMatchObject({ month: 11, day: 1, hour: 0 });
  });
});

describe("startOfWeek", () => {
  it("returns Monday", () => {
    // 2026-08-03 is a Monday.
    expect(dayKey(startOfWeek(new Date("2026-08-05T12:00:00Z"), "UTC"), "UTC")).toBe("2026-08-03");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // 2026-08-09 is a Sunday → its week began Monday the 3rd.
    expect(dayKey(startOfWeek(new Date("2026-08-09T12:00:00Z"), "UTC"), "UTC")).toBe("2026-08-03");
  });

  it("is timezone-aware", () => {
    // Sunday 22:00 UTC is Monday in IST, so the weeks differ.
    const d = new Date("2026-08-09T22:00:00Z");
    expect(dayKey(startOfWeek(d, "UTC"), "UTC")).toBe("2026-08-03");
    expect(dayKey(startOfWeek(d, IST), IST)).toBe("2026-08-10");
  });
});

describe("startOfMonth / Quarter / Year", () => {
  const d = new Date("2026-08-17T09:00:00Z");
  it("finds the first of the month", () => {
    expect(dayKey(startOfMonth(d, "UTC"), "UTC")).toBe("2026-08-01");
  });
  it("finds the first of the quarter", () => {
    expect(dayKey(startOfQuarter(d, "UTC"), "UTC")).toBe("2026-07-01");
  });
  it("finds January 1", () => {
    expect(dayKey(startOfYear(d, "UTC"), "UTC")).toBe("2026-01-01");
  });
  it("puts each month in the right quarter", () => {
    for (const [month, expected] of [
      [1, "01"],
      [3, "01"],
      [4, "04"],
      [6, "04"],
      [7, "07"],
      [9, "07"],
      [10, "10"],
      [12, "10"],
    ] as const) {
      const probe = new Date(Date.UTC(2026, month - 1, 15, 12));
      expect(dayKey(startOfQuarter(probe, "UTC"), "UTC")).toBe(`2026-${expected}-01`);
    }
  });
});

describe("isoWeek", () => {
  it("numbers a mid-year week", () => {
    expect(isoWeek(new Date("2026-08-03T12:00:00Z"), "UTC")).toEqual({ year: 2026, week: 32 });
  });

  it("assigns early-January days to the previous ISO year where correct", () => {
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"), "UTC")).toEqual({ year: 2026, week: 53 });
  });

  it("formats a sortable key", () => {
    expect(isoWeekKey(new Date("2026-02-02T12:00:00Z"), "UTC")).toBe("2026-W06");
    expect(isoWeekKey(new Date("2026-08-03T12:00:00Z"), "UTC")).toBe("2026-W32");
  });
});

describe("eachDay", () => {
  it("is inclusive at both ends", () => {
    const days = eachDay(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-04T23:59:00Z"), "UTC");
    expect(days).toEqual(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("returns a single day when from and to share one", () => {
    const days = eachDay(new Date("2026-08-01T01:00:00Z"), new Date("2026-08-01T22:00:00Z"), "UTC");
    expect(days).toEqual(["2026-08-01"]);
  });

  it("returns nothing for an inverted range", () => {
    expect(eachDay(new Date("2026-08-05T00:00:00Z"), new Date("2026-08-01T00:00:00Z"))).toEqual([]);
  });

  it("advances exactly one day across a DST transition", () => {
    const days = eachDay(new Date("2026-03-07T12:00:00Z"), new Date("2026-03-10T12:00:00Z"), NY);
    expect(days).toEqual(["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  });

  it("spans a year boundary", () => {
    const days = eachDay(new Date("2026-12-30T12:00:00Z"), new Date("2027-01-02T12:00:00Z"), "UTC");
    expect(days).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("produces 366 days for a leap year", () => {
    const days = eachDay(new Date("2028-01-01T12:00:00Z"), new Date("2028-12-31T12:00:00Z"), "UTC");
    expect(days).toHaveLength(366);
  });
});

describe("periodBounds", () => {
  // Monday 2026-08-03, 10:00 UTC.
  const now = new Date("2026-08-03T10:00:00Z");

  it("returns the last COMPLETE week", () => {
    const b = periodBounds("weekly", now, "UTC");
    expect(dayKey(b.from, "UTC")).toBe("2026-07-27");
    expect(dayKey(b.to, "UTC")).toBe("2026-08-03");
    expect(b.label).toBe("2026-W31");
  });

  it("returns the last COMPLETE month", () => {
    const b = periodBounds("monthly", now, "UTC");
    expect(dayKey(b.from, "UTC")).toBe("2026-07-01");
    expect(dayKey(b.to, "UTC")).toBe("2026-08-01");
    expect(b.label).toBe("2026-07");
  });

  it("returns the last COMPLETE quarter", () => {
    const b = periodBounds("quarterly", now, "UTC");
    expect(dayKey(b.from, "UTC")).toBe("2026-04-01");
    expect(dayKey(b.to, "UTC")).toBe("2026-07-01");
    expect(b.label).toBe("2026-Q2");
  });

  it("returns the last COMPLETE year", () => {
    const b = periodBounds("annual", now, "UTC");
    expect(dayKey(b.from, "UTC")).toBe("2025-01-01");
    expect(dayKey(b.to, "UTC")).toBe("2026-01-01");
    expect(b.label).toBe("2025");
  });

  it("does not include the in-progress period", () => {
    // Run on the 3rd of the month: the monthly report must be last month.
    const b = periodBounds("monthly", new Date("2026-08-03T00:00:00Z"), "UTC");
    expect(b.to.getTime()).toBeLessThanOrEqual(new Date("2026-08-01T00:00:01Z").getTime());
  });
});

describe("previousPeriod", () => {
  it("mirrors the span immediately before", () => {
    const b = periodBounds("monthly", new Date("2026-08-03T10:00:00Z"), "UTC");
    const p = previousPeriod(b);
    expect(p.to.getTime()).toBe(b.from.getTime());
    expect(b.from.getTime() - p.from.getTime()).toBe(b.to.getTime() - b.from.getTime());
  });
});

describe("rangeBounds", () => {
  it("builds a trailing window", () => {
    const now = new Date("2026-08-03T10:00:00Z");
    const b = rangeBounds(30, now);
    expect(b.to.getTime()).toBe(now.getTime());
    expect(dayKey(b.from, "UTC")).toBe("2026-07-04");
    expect(b.label).toBe("30d");
  });
});

describe("bucketKey", () => {
  const d = new Date("2026-08-05T12:00:00Z"); // Wednesday
  it("buckets by day", () => expect(bucketKey(d, "day", "UTC")).toBe("2026-08-05"));
  it("buckets by week (Monday)", () => expect(bucketKey(d, "week", "UTC")).toBe("2026-08-03"));
  it("buckets by month", () => expect(bucketKey(d, "month", "UTC")).toBe("2026-08-01"));
});

describe("within", () => {
  const from = new Date("2026-08-01T00:00:00Z");
  const to = new Date("2026-08-08T00:00:00Z");

  it("is half-open: start inclusive, end exclusive", () => {
    expect(within(from, from, to)).toBe(true);
    expect(within(to, from, to)).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(within(null, from, to)).toBe(false);
    expect(within(undefined, from, to)).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-31T00:00:00Z"))).toBe(30);
  });

  it("never returns zero, so it is always a safe denominator", () => {
    const t = new Date("2026-08-01T00:00:00Z");
    expect(daysBetween(t, t)).toBe(1);
    expect(daysBetween(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-01T01:00:00Z"))).toBe(1);
  });
});
