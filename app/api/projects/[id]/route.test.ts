// P0-5 regression coverage: optimistic concurrency on editorDoc saves.
// The mocked Prisma layer actually simulates conditional-update semantics
// (updateMany only "succeeds" a row whose current editorVersion matches the
// WHERE clause) so these tests exercise the real conflict-detection logic,
// not just that the route calls some mock.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

interface FakeProject {
  id: string;
  userId: string;
  editorDoc: unknown;
  editorVersion: number;
  title: string;
  uploadedVideoUrl: string | null;
  faceTimeline: unknown;
}

let db: FakeProject;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        db.id === where.id && db.userId === where.userId ? { ...db } : null,
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (db.id === where.id ? { ...db } : null)),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; userId: string; editorVersion: number }; data: Record<string, unknown> }) => {
        if (db.id !== where.id || db.userId !== where.userId || db.editorVersion !== where.editorVersion) {
          return { count: 0 };
        }
        const { editorVersion, ...rest } = data;
        Object.assign(db, rest);
        if (editorVersion && typeof editorVersion === "object" && "increment" in editorVersion) {
          db.editorVersion += (editorVersion as { increment: number }).increment;
        }
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(db, data);
        return { ...db };
      }),
    },
  },
}));

const { PATCH } = await import("./route");

function makeDoc(marker: string) {
  return { version: 1, aspect: "9:16", fps: 30, tracks: { video: [], text: [], audio: [], image: [], caption: [] }, marker };
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/projects/proj-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ctx = { params: Promise.resolve({ id: "proj-1" }) };

describe("PATCH /api/projects/[id] — optimistic concurrency", () => {
  beforeEach(() => {
    db = { id: "proj-1", userId: "u1", editorDoc: null, editorVersion: 1, title: "t", uploadedVideoUrl: null, faceTimeline: null };
    authUser = { userId: "u1" };
  });

  it("normal save: correct expectedVersion succeeds and bumps editorVersion", async () => {
    const res = await PATCH(patchRequest({ editorDoc: makeDoc("A"), expectedVersion: 1 }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.project.editorVersion).toBe(2);
    expect(json.project.editorDoc).toMatchObject({ marker: "A" });
  });

  it("409 conflict: stale expectedVersion is rejected and does NOT overwrite the newer save", async () => {
    // Tab A saves first (version 1 -> 2, doc "A").
    const resA = await PATCH(patchRequest({ editorDoc: makeDoc("A"), expectedVersion: 1 }), ctx);
    expect(resA.status).toBe(200);

    // Tab B, still holding the stale version 1, tries to save "B".
    const resB = await PATCH(patchRequest({ editorDoc: makeDoc("B"), expectedVersion: 1 }), ctx);
    const jsonB = await resB.json();

    expect(resB.status).toBe(409);
    expect(jsonB.error).toBe("version_conflict");
    expect(jsonB.currentVersion).toBe(2);
    // Tab A's save must survive untouched.
    expect(db.editorDoc).toMatchObject({ marker: "A" });
    expect(db.editorVersion).toBe(2);
  });

  it("out-of-order network completion: an older request that resolves LATE still can't clobber a newer save, because the check is on stored state, not request order", async () => {
    // Simulates Tab A's request being sent first but its response arriving
    // after Tab B's already-completed save — by the time A's PATCH actually
    // executes against `db`, B has already moved the version forward.
    const resB = await PATCH(patchRequest({ editorDoc: makeDoc("B"), expectedVersion: 1 }), ctx);
    expect(resB.status).toBe(200);

    const resA = await PATCH(patchRequest({ editorDoc: makeDoc("A-late"), expectedVersion: 1 }), ctx);
    expect(resA.status).toBe(409);
    expect(db.editorDoc).toMatchObject({ marker: "B" });
  });

  it("failed save: missing expectedVersion on an editorDoc patch is rejected before touching the database", async () => {
    const res = await PATCH(patchRequest({ editorDoc: makeDoc("A") }), ctx);
    expect(res.status).toBe(400);
    expect(db.editorDoc).toBeNull(); // untouched
  });

  it("a non-editorDoc patch (e.g. title) is unaffected by version checking", async () => {
    const res = await PATCH(patchRequest({ title: "New title" }), ctx);
    expect(res.status).toBe(200);
    expect(db.title).toBe("New title");
    expect(db.editorVersion).toBe(1); // unchanged — not an editorDoc save
  });

  it("401s without touching the database when unauthenticated", async () => {
    authUser = null;
    const res = await PATCH(patchRequest({ editorDoc: makeDoc("A"), expectedVersion: 1 }), ctx);
    expect(res.status).toBe(401);
    expect(db.editorDoc).toBeNull();
  });
});
