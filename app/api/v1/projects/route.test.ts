import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockAuth: { userId: string; scopes: string[] } | null;
vi.mock("@/lib/auth", () => ({
  getApiKeyAuth: vi.fn(async () => mockAuth),
}));

let created: Record<string, unknown> | null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { id: "proj_1", createdAt: new Date(), ...data };
      }),
      findMany: vi.fn(async () => [
        { id: "proj_1", title: "T", productType: "split-screen", status: "draft", uploadedVideoUrl: null, createdAt: new Date(), _count: { clips: 0 } },
      ]),
    },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { incrWithExpire: vi.fn(async () => 1), get: vi.fn(async () => null), set: vi.fn(async () => {}) },
}));

const { GET, POST } = await import("./route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/v1/projects", { method: "POST", body: JSON.stringify(body) }));
const get = () => GET(new NextRequest("http://localhost/api/v1/projects"));

beforeEach(() => {
  mockAuth = { userId: "u1", scopes: ["read", "write"] };
  created = null;
  vi.clearAllMocks();
});

describe("POST /api/v1/projects", () => {
  it("creates a draft project scoped to the key's user", async () => {
    const res = await post({ title: "  Podcast ep 42  " });
    expect(res.status).toBe(201);
    expect(created).toMatchObject({ userId: "u1", title: "Podcast ep 42", status: "draft" });
    const json = await res.json();
    expect(json.project.id).toBe("proj_1");
  });

  it("accepts a valid https uploadedVideoUrl and rejects non-https", async () => {
    const ok = await post({ title: "t", uploadedVideoUrl: "https://cdn.example.com/v.mp4" });
    expect(ok.status).toBe(201);
    expect(created).toMatchObject({ uploadedVideoUrl: "https://cdn.example.com/v.mp4" });

    expect((await post({ title: "t", uploadedVideoUrl: "http://x.com/v.mp4" })).status).toBe(400);
    expect((await post({ title: "t", uploadedVideoUrl: "not a url" })).status).toBe(400);
    expect((await post({ title: "t", uploadedVideoUrl: 42 })).status).toBe(400);
  });

  it("rejects a missing/blank/oversized title", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ title: "   " })).status).toBe(400);
    expect((await post({ title: "x".repeat(201) })).status).toBe(400);
  });

  it("rejects keys without write scope with 403", async () => {
    mockAuth = { userId: "u1", scopes: ["read"] };
    expect((await post({ title: "t" })).status).toBe(403);
  });

  it("rejects a missing/invalid key with 401", async () => {
    mockAuth = null;
    expect((await post({ title: "t" })).status).toBe(401);
    expect((await get()).status).toBe(401);
  });
});

describe("GET /api/v1/projects", () => {
  it("lists the caller's projects", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].id).toBe("proj_1");
  });
});
