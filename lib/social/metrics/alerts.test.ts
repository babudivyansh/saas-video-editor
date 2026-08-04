import { describe, it, expect } from "vitest";
import { computeAlerts } from "./alerts";
import type { PostRow, SnapshotRow } from "./types";

const NOW = new Date("2026-08-03T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const snap = (n: number, followers: number): SnapshotRow => ({
  capturedAt: daysAgo(n),
  followers,
});

let seq = 0;
function post(n: number, views: number, likes: number): PostRow {
  seq += 1;
  return { id: `p${seq}`, publishedAt: daysAgo(n), views, likes, comments: 0, shares: 0 };
}

describe("alerts carry structured codes", () => {
  // The whole reason for the refactor: the app ships 13 locales and a pure
  // module cannot know which one the reader wants.
  it("emits a code and params, not just an English sentence", () => {
    const alerts = computeAlerts([snap(8, 990), snap(0, 1_050)], [], NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe("followerMilestone");
    expect(alerts[0].params).toEqual({ milestone: 1_000 });
  });

  it("keeps params numeric and unformatted, so the renderer can localise them", () => {
    const alerts = computeAlerts([snap(8, 10_000), snap(0, 9_500)], [], NOW);
    const drop = alerts.find((a) => a.code === "followerDrop")!;
    expect(drop.params.lost).toBe(500);
    expect(typeof drop.params.pct).toBe("number");
  });

  it("still provides an English fallback for existing consumers", () => {
    const alerts = computeAlerts([snap(8, 990), snap(0, 1_050)], [], NOW);
    expect(alerts[0].message).toContain("1K followers");
  });
});

describe("follower milestones", () => {
  it("fires when a threshold is crossed within the week", () => {
    expect(computeAlerts([snap(8, 9_900), snap(0, 10_100)], [], NOW)[0].code).toBe("followerMilestone");
  });

  it("does not fire when the threshold was already passed", () => {
    expect(computeAlerts([snap(8, 10_100), snap(0, 10_500)], [], NOW)).toHaveLength(0);
  });

  it("reports the highest threshold when several are crossed at once", () => {
    const alerts = computeAlerts([snap(8, 900), snap(0, 12_000)], [], NOW);
    expect(alerts[0].params.milestone).toBe(10_000);
  });
});

describe("follower drop", () => {
  it("fires on a loss above the threshold", () => {
    const alerts = computeAlerts([snap(8, 10_000), snap(0, 9_800)], [], NOW);
    expect(alerts.map((a) => a.code)).toContain("followerDrop");
  });

  it("ignores a loss too small to be meaningful", () => {
    // 0.5% — below the 1% threshold.
    expect(computeAlerts([snap(8, 10_000), snap(0, 9_950)], [], NOW)).toHaveLength(0);
  });

  it("does not divide by zero on an account with no followers", () => {
    expect(() => computeAlerts([snap(8, 0), snap(0, 0)], [], NOW)).not.toThrow();
  });
});

describe("engagement change", () => {
  const week = (n: number, views: number, likes: number) => [post(n, views, likes), post(n, views, likes)];

  it("fires a drop when engagement falls sharply", () => {
    const posts = [...week(10, 1000, 100), ...week(3, 1000, 20)]; // 10% → 2%
    const alerts = computeAlerts([], posts, NOW);
    const drop = alerts.find((a) => a.code === "engagementDrop")!;
    expect(drop).toBeDefined();
    expect(drop.severity).toBe("warning");
    expect(drop.params.pct).toBe(80);
  });

  it("fires a spike when engagement rises sharply", () => {
    const posts = [...week(10, 1000, 20), ...week(3, 1000, 100)];
    const spike = computeAlerts([], posts, NOW).find((a) => a.code === "engagementSpike")!;
    expect(spike).toBeDefined();
    expect(spike.severity).toBe("info");
  });

  it("stays quiet for a modest change", () => {
    const posts = [...week(10, 1000, 100), ...week(3, 1000, 90)];
    expect(computeAlerts([], posts, NOW)).toHaveLength(0);
  });

  it("needs at least two rated posts per week — one post is noise, not signal", () => {
    const posts = [post(10, 1000, 100), post(3, 1000, 10)];
    expect(computeAlerts([], posts, NOW)).toHaveLength(0);
  });
});

describe("determinism", () => {
  it("takes `now` as a required argument, so results never depend on the clock", () => {
    const snapshots = [snap(8, 9_900), snap(0, 10_100)];
    const later = new Date(NOW.getTime() + 30 * 86_400_000);
    // The same data read a month later no longer crosses "within the week".
    expect(computeAlerts(snapshots, [], NOW)).toHaveLength(1);
    expect(computeAlerts(snapshots, [], later)).toHaveLength(0);
  });

  it("returns nothing for empty input", () => {
    expect(computeAlerts([], [], NOW)).toEqual([]);
  });
});
