import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));
const snapshots: Array<{ version: number; reason: string }> = [];
vi.mock("@/lib/project-versions", () => ({
  snapshotDoc: vi.fn(async (_p: string, _doc: unknown, version: number, reason: string) => {
    snapshots.push({ version, reason });
    return true;
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => (where.id === "p1" && where.userId === "u1" ? { id: "p1" } : null)),
    },
    projectVersion: {
      findMany: vi.fn(async () => [{ id: "v1", version: 3, reason: "autosave", clipCount: 2, durationSec: 8, createdAt: new Date(0) }]),
    },
  },
}));

const { GET, POST } = await import("./route");
const ctx = { params: Promise.resolve({ id: "p1" }) };
const doc = { version: 1, aspect: "9:16", fps: 30, tracks: { video: [], text: [], audio: [], image: [], caption: [] } };
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/projects/p1/versions", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("/api/projects/[id]/versions", () => {
  beforeEach(() => {
    authUser = { userId: "u1" };
    snapshots.length = 0;
  });

  it("lists the owner's versions", async () => {
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/versions"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).versions[0]).toMatchObject({ id: "v1", clipCount: 2 });
  });

  it("404s for someone else's project and 401s signed out", async () => {
    authUser = { userId: "u2" };
    expect((await GET(new NextRequest("http://localhost/api/projects/p1/versions"), ctx)).status).toBe(404);
    expect((await POST(post({ doc, version: 2 }), ctx)).status).toBe(404);
    authUser = null;
    expect((await GET(new NextRequest("http://localhost/api/projects/p1/versions"), ctx)).status).toBe(401);
  });

  it("sets a valid local copy aside as a conflict snapshot", async () => {
    const res = await POST(post({ doc, version: 2 }), ctx);
    expect(res.status).toBe(200);
    expect(snapshots).toEqual([{ version: 2, reason: "conflict" }]);
  });

  it("rejects a malformed or oversized doc", async () => {
    expect((await POST(post({ doc: { version: 2, tracks: {} } }), ctx)).status).toBe(400);
    expect((await POST(post({}), ctx)).status).toBe(400);
    const huge = { ...doc, pad: "x".repeat(1_000_001) };
    expect((await POST(post({ doc: huge }), ctx)).status).toBe(413);
    expect(snapshots).toEqual([]);
  });
});
