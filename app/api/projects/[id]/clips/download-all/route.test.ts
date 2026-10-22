import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser), getServerAuthUser: vi.fn(async () => null) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const projectFindFirst = vi.fn(async (a: { where: { id: string; userId: string } }) =>
  a.where.id === "p1" && a.where.userId === "u1" ? { id: "p1", title: "My talk" } : null,
);
const clipFindMany = vi.fn(async (_a: { where: Record<string, unknown> }) => [
  { index: 0, title: "Hook", videoUrl: "https://cdn.example/c0.mp4" },
]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: (a: never) => projectFindFirst(a) },
    clip: { findMany: (a: never) => clipFindMany(a) },
  },
}));

const { GET } = await import("./route");
const ctx = { params: Promise.resolve({ id: "p1" }) };
const req = (qs = "") => new NextRequest(`http://localhost/api/projects/p1/clips/download-all${qs}`);

beforeEach(() => {
  authUser = { userId: "u1" };
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
});

describe("GET .../clips/download-all", () => {
  it("401s without a session", async () => {
    authUser = null;
    expect((await GET(req(), ctx)).status).toBe(401);
  });

  it("zips every ready clip when no ids are given", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const where = clipFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ projectId: "p1", status: "ready" });
    expect(where).not.toHaveProperty("id");
  });

  it("limits the zip to ?ids=, still scoped to the project", async () => {
    await GET(req("?ids=c1,%20c2,,c3"), ctx);
    const where = clipFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ projectId: "p1", status: "ready", id: { in: ["c1", "c2", "c3"] } });
  });

  it("caps the id list at 100", async () => {
    const many = Array.from({ length: 150 }, (_, i) => `c${i}`).join(",");
    await GET(req(`?ids=${many}`), ctx);
    const where = clipFindMany.mock.calls[0][0].where as { id: { in: string[] } };
    expect(where.id.in).toHaveLength(100);
  });

  it("404s a project the caller doesn't own", async () => {
    authUser = { userId: "u2" };
    expect((await GET(req("?ids=c1"), ctx)).status).toBe(404);
    expect(clipFindMany).not.toHaveBeenCalled();
  });
});
