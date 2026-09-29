import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { CRON_SCHEDULE, isDue } from "./cron-schedule";

// ops/crontab is the human-readable schedule; lib/cron-schedule.ts is what
// /api/cron-tick actually runs. They must be the same list, or production
// (tick) and a real-cron host would run different jobs.
function parseCrontab() {
  const text = fs.readFileSync(path.join(process.cwd(), "ops", "crontab"), "utf8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trimStart().startsWith("#") && !/^[A-Z_]+=/.test(l.trim()))
    .map((l) => {
      const fields = l.trim().split(/\s+/);
      const schedule = fields.slice(0, 5).join(" ");
      const secret = l.match(/\$([A-Z_]+)/)?.[1];
      const url = l.match(/https?:\/\/[^\s"]+/)?.[0] ?? "";
      return { schedule, path: new URL(url).pathname + new URL(url).search, secret };
    });
}

const key = (e: { schedule: string; path: string; secret?: string }) => `${e.schedule} | ${e.path} | ${e.secret}`;

describe("CRON_SCHEDULE", () => {
  it("is exactly the schedule in ops/crontab (times, paths and secrets)", () => {
    expect(CRON_SCHEDULE.map(key).sort()).toEqual(parseCrontab().map(key).sort());
  });
});

describe("isDue", () => {
  const at = (iso: string) => new Date(`${iso}:00Z`);

  it("matches fixed times, steps and wildcards", () => {
    expect(isDue("0 3 * * *", at("2026-09-30T03:00"))).toBe(true);
    expect(isDue("0 3 * * *", at("2026-09-30T03:01"))).toBe(false);
    expect(isDue("*/15 * * * *", at("2026-09-30T10:45"))).toBe(true);
    expect(isDue("*/15 * * * *", at("2026-09-30T10:46"))).toBe(false);
    expect(isDue("*/2 * * * *", at("2026-09-30T10:08"))).toBe(true);
    expect(isDue("*/2 * * * *", at("2026-09-30T10:07"))).toBe(false);
    expect(isDue("0 * * * *", at("2026-09-30T17:00"))).toBe(true);
  });

  it("honours day-of-week (Monday = 1; Sunday as 0 or 7)", () => {
    expect(isDue("0 8 * * 1", at("2026-09-28T08:00"))).toBe(true); // Monday
    expect(isDue("0 8 * * 1", at("2026-09-29T08:00"))).toBe(false); // Tuesday
    expect(isDue("0 8 * * 7", at("2026-09-27T08:00"))).toBe(true); // Sunday
    expect(isDue("0 8 * * 0", at("2026-09-27T08:00"))).toBe(true);
  });

  it("supports lists and ranges, and rejects malformed expressions", () => {
    expect(isDue("0,30 9-17 * * *", at("2026-09-30T12:30"))).toBe(true);
    expect(isDue("0,30 9-17 * * *", at("2026-09-30T18:30"))).toBe(false);
    expect(isDue("0 3 * *", at("2026-09-30T03:00"))).toBe(false);
  });
});
