import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

let rows: Array<{ id: string; readAt: string | null }>;
let unreadCount: number;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(async () => rows),
      count: vi.fn(async () => unreadCount),
    },
  },
}));

const { GET } = await import("./route");

function get(url: string) {
  return GET(new NextRequest(url));
}

beforeEach(() => {
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  rows = [];
  unreadCount = 0;
});

describe("GET /api/notifications", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await get("http://localhost/api/notifications");
    expect(res.status).toBe(401);
  });

  it("returns items, nextCursor, and unreadCount", async () => {
    rows = [{ id: "n1", readAt: null }];
    unreadCount = 3;
    const res = await get("http://localhost/api/notifications?limit=20");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.items).toEqual(rows);
    expect(data.nextCursor).toBeNull();
    expect(data.unreadCount).toBe(3);
  });

  it("paginates via cursor when there's an extra row", async () => {
    rows = Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, readAt: null }));
    const res = await get("http://localhost/api/notifications?limit=2");
    const data = await res.json();
    expect(data.items).toHaveLength(2);
    expect(data.nextCursor).toBe("2");
  });
});
