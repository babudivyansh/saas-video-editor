import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));
vi.mock("@/lib/dashboard-summary-cache", () => ({ invalidateDashboardSummary: vi.fn(async () => {}) }));
const snapshots: Array<{ doc: unknown; version: number; reason: string }> = [];
vi.mock("@/lib/project-versions", () => ({
  snapshotDoc: vi.fn(async (_p: string, doc: unknown, version: number, reason: string) => {
    snapshots.push({ doc, version, reason });
    return true;
  }),
}));

let project: { id: string; userId: string; editorDoc: unknown; editorVersion: number };
const versions = [{ id: "v1", projectId: "p1", doc: { marker: "old" } }];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        project.id === where.id && project.userId === where.userId ? { ...project } : null,
      ),
      findUnique: vi.fn(async () => ({ ...project })),
      updateMany: vi.fn(async ({ where, data }: { where: { editorVersion: number; userId: string }; data: { editorDoc: unknown } }) => {
        if (where.editorVersion !== project.editorVersion || where.userId !== project.userId) return { count: 0 };
        project = { ...project, editorDoc: data.editorDoc, editorVersion: project.editorVersion + 1 };
        return { count: 1 };
      }),
    },
    projectVersion: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; projectId: string } }) =>
        versions.find((v) => v.id === where.id && v.projectId === where.projectId) ?? null,
      ),
    },
  },
}));

const { POST } = await import("./route");

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/projects/p1/versions/v1", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const ctx = (versionId = "v1") => ({ params: Promise.resolve({ id: "p1", versionId }) });

describe("POST /api/projects/[id]/versions/[versionId] — restore", () => {
  beforeEach(() => {
    authUser = { userId: "u1" };
    project = { id: "p1", userId: "u1", editorDoc: { marker: "now" }, editorVersion: 5 };
    snapshots.length = 0;
  });

  it("restores the snapshot, bumps the version and keeps the replaced doc", async () => {
    const res = await POST(req({ expectedVersion: 5 }), ctx());
    expect(res.status).toBe(200);
    const { project: out } = await res.json();
    expect(out.editorDoc).toEqual({ marker: "old" });
    expect(out.editorVersion).toBe(6);
    expect(snapshots).toEqual([{ doc: { marker: "now" }, version: 5, reason: "restore" }]);
  });

  it("409s on a stale version without restoring", async () => {
    const res = await POST(req({ expectedVersion: 4 }), ctx());
    expect(res.status).toBe(409);
    expect(project.editorDoc).toEqual({ marker: "now" });
    expect(snapshots).toEqual([]);
  });

  it("requires expectedVersion, ownership and an existing version", async () => {
    expect((await POST(req({}), ctx())).status).toBe(400);
    expect((await POST(req({ expectedVersion: 5 }), ctx("nope"))).status).toBe(404);
    authUser = { userId: "u2" };
    expect((await POST(req({ expectedVersion: 5 }), ctx())).status).toBe(404);
    authUser = null;
    expect((await POST(req({ expectedVersion: 5 }), ctx())).status).toBe(401);
  });
});
