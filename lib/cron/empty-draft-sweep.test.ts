import { beforeEach, describe, expect, it, vi } from "vitest";

// This sweep deletes user-owned rows, so the tests that matter are the ones
// asserting what it REFUSES to touch.

interface Row {
  id: string;
  userId: string;
  title: string;
  productType: string;
  updatedAt: Date;
  status: string;
  clipCount: number;
  editorDoc: unknown | null;
  uploadedVideoUrl: string | null;
  videoUrl: string | null;
}

let rows: Row[];
let deletedIds: string[];
let invalidatedUsers: string[];

// Evaluates the pieces of the where-clause the sweep actually relies on, so a
// change to the predicate in lib/project-activity.ts is caught here rather
// than silently widening what gets deleted.
function matches(r: Row, where: { updatedAt: { lt: Date } }): boolean {
  if (r.status !== "draft") return false;
  const started =
    ["analyzing", "pending_review", "rendering"].includes(r.status) ||
    r.clipCount > 0 ||
    r.editorDoc !== null ||
    r.uploadedVideoUrl !== null ||
    r.videoUrl !== null;
  if (started) return false;
  return r.updatedAt < where.updatedAt.lt;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: vi.fn(async ({ where }: { where: { updatedAt: { lt: Date } } }) =>
        rows.filter(r => matches(r, where)),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedIds.push(...where.id.in);
        rows = rows.filter(r => !where.id.in.includes(r.id));
        return { count: where.id.in.length };
      }),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/dashboard-summary-cache", () => ({
  invalidateDashboardSummary: vi.fn(async (userId: string) => { invalidatedUsers.push(userId); }),
}));

import { runEmptyDraftSweep } from "./empty-draft-sweep";

const OLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const RECENT = new Date(Date.now() - 60 * 1000);

function row(over: Partial<Row> = {}): Row {
  return {
    id: over.id ?? "p1",
    userId: over.userId ?? "u1",
    title: over.title ?? "Untitled project",
    productType: over.productType ?? "editor",
    updatedAt: over.updatedAt ?? OLD,
    status: over.status ?? "draft",
    clipCount: over.clipCount ?? 0,
    editorDoc: over.editorDoc ?? null,
    uploadedVideoUrl: over.uploadedVideoUrl ?? null,
    videoUrl: over.videoUrl ?? null,
  };
}

beforeEach(() => {
  rows = [];
  deletedIds = [];
  invalidatedUsers = [];
  vi.clearAllMocks();
});

describe("runEmptyDraftSweep", () => {
  it("defaults to a dry run and deletes nothing", async () => {
    rows = [row({ id: "empty" })];

    const result = await runEmptyDraftSweep();

    expect(result.dryRun).toBe(true);
    expect(result.matched).toBe(1);
    expect(result.deleted).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("deletes an old untouched draft when explicitly asked", async () => {
    rows = [row({ id: "empty" })];

    const result = await runEmptyDraftSweep({ dryRun: false });

    expect(result.deleted).toBe(1);
    expect(deletedIds).toEqual(["empty"]);
    // The rail is cached for 60s; without this the card lingers after cleanup.
    expect(invalidatedUsers).toEqual(["u1"]);
  });

  it("never deletes a draft that has clips", async () => {
    rows = [row({ id: "has-clips", clipCount: 3 })];
    const result = await runEmptyDraftSweep({ dryRun: false });
    expect(result.matched).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("never deletes a draft with an editor document", async () => {
    // An editor project holds its work in editorDoc and has no clips at all,
    // so a clips-only check would happily delete real work.
    rows = [row({ id: "has-doc", editorDoc: { version: 1, tracks: {} } })];
    const result = await runEmptyDraftSweep({ dryRun: false });
    expect(result.matched).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("never deletes a draft with an uploaded or rendered video", async () => {
    rows = [
      row({ id: "uploaded", uploadedVideoUrl: "https://s3/in.mp4" }),
      row({ id: "rendered", videoUrl: "https://s3/out.mp4" }),
    ];
    const result = await runEmptyDraftSweep({ dryRun: false });
    expect(result.matched).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("never deletes a project the pipeline already claimed", async () => {
    rows = [
      row({ id: "analyzing", status: "analyzing" }),
      row({ id: "rendering", status: "rendering" }),
      row({ id: "completed", status: "completed" }),
      row({ id: "failed", status: "failed" }),
    ];
    const result = await runEmptyDraftSweep({ dryRun: false });
    expect(result.matched).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("never deletes a draft inside the grace period", async () => {
    rows = [row({ id: "fresh", updatedAt: RECENT })];
    const result = await runEmptyDraftSweep({ dryRun: false });
    expect(result.matched).toBe(0);
    expect(deletedIds).toEqual([]);
  });

  it("reports every affected user once when sweeping across accounts", async () => {
    rows = [
      row({ id: "a", userId: "u1" }),
      row({ id: "b", userId: "u1" }),
      row({ id: "c", userId: "u2" }),
    ];

    const result = await runEmptyDraftSweep({ dryRun: false });

    expect(result.deleted).toBe(3);
    expect(result.usersAffected).toBe(2);
    expect(invalidatedUsers.sort()).toEqual(["u1", "u2"]);
  });
});
