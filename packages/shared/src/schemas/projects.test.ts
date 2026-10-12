import { describe, expect, it } from "vitest";
import { clipSchema, draftProgress, scoreSpread, sortProjects, type ProjectSummary } from "./projects";

const p = (id: string, updatedAt: string, clipCount = 0): ProjectSummary => ({
  id,
  title: id,
  kind: "autoclip",
  status: "completed",
  aspect: "9:16",
  thumbnailUrl: "x",
  clipCount,
  durationSec: 10,
  updatedAt,
});

describe("projects schemas", () => {
  it("counts draft progress in 20% steps, ignoring unknown or repeated steps", () => {
    expect(draftProgress([])).toBe(0);
    expect(draftProgress(["media", "trim", "captions"])).toBe(60);
    expect(draftProgress(["media", "media", "nope"])).toBe(20);
  });

  it("buckets scores, skipping unscored clips", () => {
    expect(scoreSpread([{ score: 92 }, { score: 88 }, { score: 81 }, { score: 74 }, { score: 61 }, { score: 12 }, { score: null }])).toEqual([1, 2, 1, 1, 1]);
  });

  it("sorts projects", () => {
    const list = [p("b", "2026-09-20", 3), p("a", "2026-09-28", 12), p("c", "2026-09-01", 0)];
    expect(sortProjects(list, "recent").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(sortProjects(list, "oldest").map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(sortProjects(list, "name").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(sortProjects(list, "clips").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps clip scores in the web's 0–99 range", () => {
    const base = { id: "c", projectId: "p", rank: 1, title: "t", durationSec: 1, aspect: "9:16", status: "ready", thumbnailUrl: "x", favorite: false, failureReason: null };
    expect(clipSchema.safeParse({ ...base, score: 99 }).success).toBe(true);
    expect(clipSchema.safeParse({ ...base, score: 100 }).success).toBe(false);
  });
});
