import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let isAdmin = true;
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => (isAdmin ? { userId: "admin-1", email: "admin@test.co", sessionId: "s1" } : null)),
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));
const getUserTimeline = vi.fn(async () => ({ items: [], nextBefore: null }));
const getUserActivitySummary = vi.fn(async () => ({ autoClipRuns: 2 }));
vi.mock("@/lib/admin/user-activity", () => ({ getUserTimeline, getUserActivitySummary }));

const { GET } = await import("./route");
const get = (qs = "") =>
  GET(new NextRequest(`http://localhost/api/admin/users/u1/activity${qs}`), { params: Promise.resolve({ id: "u1" }) });

beforeEach(() => {
  isAdmin = true;
  vi.clearAllMocks();
});

describe("/api/admin/users/:id/activity", () => {
  it("is admin-only", async () => {
    isAdmin = false;
    expect((await get()).status).toBe(403);
    expect(getUserTimeline).not.toHaveBeenCalled();
  });

  it("returns the first page with the totals", async () => {
    const body = await (await get()).json();
    expect(body).toEqual({ items: [], nextBefore: null, summary: { autoClipRuns: 2 } });
    expect(getUserTimeline).toHaveBeenCalledWith("u1", { limit: 50, before: undefined });
  });

  it("returns later pages without the totals", async () => {
    const body = await (await get("?before=2026-11-12T00:00:00.000Z&limit=20")).json();
    expect(body.summary).toBeUndefined();
    expect(getUserTimeline).toHaveBeenCalledWith("u1", { limit: 20, before: new Date("2026-11-12T00:00:00.000Z") });
  });

  it("rejects a bad cursor", async () => {
    expect((await get("?before=yesterday")).status).toBe(400);
  });
});
