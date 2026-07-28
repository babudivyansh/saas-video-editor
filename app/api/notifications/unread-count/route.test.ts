import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

let unreadCount: number;
vi.mock("@/lib/prisma", () => ({
  prisma: { notification: { count: vi.fn(async () => unreadCount) } },
}));

const { GET } = await import("./route");

beforeEach(() => {
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  unreadCount = 0;
});

describe("GET /api/notifications/unread-count", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await GET(new NextRequest("http://localhost/api/notifications/unread-count"));
    expect(res.status).toBe(401);
  });

  it("returns the unread count", async () => {
    unreadCount = 5;
    const res = await GET(new NextRequest("http://localhost/api/notifications/unread-count"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.unreadCount).toBe(5);
  });
});
