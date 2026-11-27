import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ clip: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { runProgress, withRunProgress } from "./run-progress";

describe("runProgress", () => {
  it("averages clip progress, counting finished clips as done", () => {
    expect(runProgress([
      { status: "ready", progress: 100 },
      { status: "failed", progress: 40 },
      { status: "rendering", progress: 50 },
      { status: "queued", progress: 0 },
    ])).toBe(63);
  });

  it("is 0 for a run with no clips yet", () => {
    expect(runProgress([])).toBe(0);
  });
});

describe("withRunProgress", () => {
  beforeEach(() => prismaMock.clip.findMany.mockReset());

  it("replaces a rendering AutoClip run's frozen 0 with its clips' progress", async () => {
    prismaMock.clip.findMany.mockResolvedValue([
      { projectId: "p1", status: "ready", progress: 100 },
      { projectId: "p1", status: "rendering", progress: 20 },
    ]);
    const rows = await withRunProgress([
      { id: "p1", status: "rendering", progress: 0, productType: "auto-clip" },
      { id: "p2", status: "completed", progress: 0, productType: "auto-clip" },
      { id: "p3", status: "rendering", progress: 35, productType: "editor" },
    ]);
    expect(rows.map((r) => r.progress)).toEqual([60, 0, 35]);
    expect(prismaMock.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: ["p1"] } } }),
    );
  });

  it("skips the query when nothing is rendering", async () => {
    const rows = [{ id: "p1", status: "analyzing", progress: 0 }];
    expect(await withRunProgress(rows)).toBe(rows);
    expect(prismaMock.clip.findMany).not.toHaveBeenCalled();
  });
});
