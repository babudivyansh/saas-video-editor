import { describe, expect, it } from "vitest";
import { composeRequest, monthGrid, parseHashtags } from "./social";

const base = { clipId: "c1", targets: ["youtube" as const], caption: "hi", hashtags: [], when: "now" as const, scheduledAt: null };

describe("social schemas", () => {
  it("builds a Monday-first month grid", () => {
    const oct = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(oct.slice(0, 4)).toEqual([null, null, null, 1]);
    expect(oct.filter(Boolean)).toHaveLength(31);
    expect(monthGrid(2026, 1).filter(Boolean)).toHaveLength(28);
  });

  it("normalises hashtags", () => {
    expect(parseHashtags("#Founders, startup  #founders ##podcast")).toEqual(["#founders", "#startup", "#podcast"]);
  });

  it("needs a future time to schedule", () => {
    expect(composeRequest.safeParse(base).success).toBe(true);
    expect(composeRequest.safeParse({ ...base, when: "schedule", scheduledAt: new Date(Date.now() - 1000).toISOString() }).success).toBe(false);
    expect(composeRequest.safeParse({ ...base, when: "schedule", scheduledAt: new Date(Date.now() + 3600_000).toISOString() }).success).toBe(true);
  });

  it("limits caption length and hashtag shape", () => {
    expect(composeRequest.safeParse({ ...base, caption: "x".repeat(2201) }).success).toBe(false);
    expect(composeRequest.safeParse({ ...base, hashtags: ["#ok", "bad tag"] }).success).toBe(false);
    expect(composeRequest.safeParse({ ...base, targets: [] }).success).toBe(false);
  });
});
