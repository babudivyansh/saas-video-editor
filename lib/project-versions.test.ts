import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row { id: string; projectId: string; version: number; reason: string; createdAt: Date; clipCount: number; durationSec: number }
let rows: Row[] = [];
let n = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectVersion: {
      findFirst: vi.fn(async ({ where }: { where: { projectId: string } }) =>
        rows.filter((r) => r.projectId === where.projectId).sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
        const row = { ...data, id: `v${++n}`, createdAt: new Date(Date.now() + n) };
        rows.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where, skip }: { where: { projectId: string }; skip: number }) =>
        rows.filter((r) => r.projectId === where.projectId).sort((a, b) => +b.createdAt - +a.createdAt).slice(skip),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        rows = rows.filter((r) => !where.id.in.includes(r.id));
        return { count: 0 };
      }),
    },
  },
}));

const { snapshotDoc, summarizeDoc, MAX_VERSIONS } = await import("./project-versions");

const doc = (clips: number) => ({
  version: 1, aspect: "9:16", fps: 30,
  tracks: {
    video: Array.from({ length: clips }, (_, i) => ({ id: `c${i}`, type: "video", assetId: "a", srcIn: 0, timelineStart: i * 2, duration: 2, volume: 1, muted: false })),
    text: [], audio: [], image: [], caption: [],
  },
});

describe("snapshotDoc", () => {
  beforeEach(() => {
    rows = [];
    n = 0;
  });

  it("skips empty docs", async () => {
    expect(await snapshotDoc("p", null, 1, "overwrite")).toBe(false);
    expect(await snapshotDoc("p", doc(0), 1, "overwrite")).toBe(false);
  });

  it("throttles autosave snapshots but always keeps overwrites and restores", async () => {
    expect(await snapshotDoc("p", doc(1), 1, "autosave")).toBe(true);
    expect(await snapshotDoc("p", doc(2), 2, "autosave")).toBe(false);
    expect(await snapshotDoc("p", doc(2), 2, "overwrite")).toBe(true);
    expect(await snapshotDoc("p", doc(3), 3, "restore")).toBe(true);
    expect(rows.map((r) => [r.version, r.reason, r.clipCount, r.durationSec])).toEqual([
      [1, "autosave", 1, 2],
      [2, "overwrite", 2, 4],
      [3, "restore", 3, 6],
    ]);
  });

  it("keeps only the newest MAX_VERSIONS", async () => {
    for (let i = 0; i < MAX_VERSIONS + 3; i++) await snapshotDoc("p", doc(1), i, "overwrite");
    expect(rows.length).toBe(MAX_VERSIONS);
    expect(Math.min(...rows.map((r) => r.version))).toBe(3);
  });
});

describe("summarizeDoc", () => {
  it("counts clips on every track and the length", () => {
    expect(summarizeDoc(doc(3) as never)).toEqual({ clipCount: 3, durationSec: 6 });
  });
});
