import { describe, expect, it } from "vitest";
import { CRON_CATALOG, CRON_SCHEDULE, confirmPhraseFor, describeSchedule, nextDue, runIdForPath } from "./cron-catalog";
import { KNOWN_CRON_RUN_IDS } from "./cron-tracking";

describe("CRON_CATALOG", () => {
  it("describes every scheduled job, and nothing that isn't scheduled", () => {
    expect(Object.keys(CRON_CATALOG).sort()).toEqual(CRON_SCHEDULE.map((e) => e.path).sort());
  });

  it("maps every scheduled path onto a tracked run id", () => {
    for (const e of CRON_SCHEDULE) expect(KNOWN_CRON_RUN_IDS).toContain(runIdForPath(e.path));
  });

  it("treats money, deletion and user-email jobs as danger tier", () => {
    for (const p of [
      "/api/cron/refill-credits",
      "/api/cron/account-purge",
      "/api/cron/commission-payout",
      "/api/cron/asset-cleanup?job=retention",
      "/api/cron/onboarding",
      "/api/cron/feature-announcements",
    ]) expect(CRON_CATALOG[p].tier).toBe("danger");
  });
});

describe("runIdForPath / confirmPhraseFor", () => {
  it("uses the route's default job when there is no ?job=", () => {
    expect(runIdForPath("/api/cron/social-refresh")).toBe("social-refresh:refresh");
    expect(runIdForPath("/api/cron/asset-cleanup")).toBe("asset-cleanup:orphans");
    expect(runIdForPath("/api/cron/social-refresh?job=scores")).toBe("social-refresh:scores");
    expect(runIdForPath("/api/cron/mrr-snapshot")).toBe("mrr-snapshot");
  });

  it("asks for the job id on danger jobs only", () => {
    expect(confirmPhraseFor("/api/cron/refill-credits")).toBe("refill-credits");
    expect(confirmPhraseFor("/api/cron/clip-publish")).toBeNull();
    expect(confirmPhraseFor("/api/not-a-job")).toBeNull();
  });
});

describe("describeSchedule / nextDue", () => {
  it("puts the crontab's patterns into words", () => {
    expect(describeSchedule("*/15 * * * *")).toBe("Every 15 min");
    expect(describeSchedule("0 * * * *")).toBe("Hourly");
    expect(describeSchedule("30 2 * * *")).toBe("Daily 02:30 UTC");
    expect(describeSchedule("0 8 * * 1")).toBe("Mon 08:00 UTC");
    expect(describeSchedule("0,30 9-17 * * *")).toBe("0,30 9-17 * * *");
  });

  it("finds the next due minute strictly after now", () => {
    const now = new Date("2026-09-29T03:00:30Z"); // a Tuesday
    expect(nextDue("0 3 * * *", now)?.toISOString()).toBe("2026-09-30T03:00:00.000Z");
    expect(nextDue("*/2 * * * *", now)?.toISOString()).toBe("2026-09-29T03:02:00.000Z");
    expect(nextDue("0 8 * * 1", now)?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
  });
});
