import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let isAdmin = true;
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => (isAdmin ? { userId: "admin-1", email: "admin@test.co", sessionId: "s1" } : null)),
}));
const cache = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : cache.get(key) ?? null)),
    set: vi.fn(async (key: string, v: string) => void cache.set(key, v)),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));
const getFunnelReport = vi.fn(async (days: number) => ({ days, steps: [] }));
vi.mock("@/lib/admin/funnel", () => ({ FUNNEL_RANGES: [7, 30, 90], getFunnelReport }));

const { GET } = await import("./route");
const get = (qs = "") => GET(new NextRequest(`http://localhost/api/admin/funnel${qs}`));

beforeEach(() => {
  isAdmin = true;
  cache.clear();
  vi.clearAllMocks();
});

describe("/api/admin/funnel", () => {
  it("is admin-only", async () => {
    isAdmin = false;
    expect((await get()).status).toBe(403);
  });

  it("serves a known window and falls back to 30 days", async () => {
    expect((await (await get("?days=7")).json()).days).toBe(7);
    expect((await (await get("?days=365")).json()).days).toBe(30);
  });

  it("caches each window", async () => {
    await get("?days=90");
    await get("?days=90");
    expect(getFunnelReport).toHaveBeenCalledTimes(1);
  });
});
