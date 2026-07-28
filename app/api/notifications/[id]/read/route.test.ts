import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

let notification: { id: string; userId: string; readAt: Date | null } | null;
const notificationUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findUnique: vi.fn(async () => notification),
      update: (...args: unknown[]) => notificationUpdate(...args),
    },
  },
}));

const { POST } = await import("./route");

function post(id: string) {
  return POST(new NextRequest(`http://localhost/api/notifications/${id}/read`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
  notification = { id: "n1", userId: "u1", readAt: null };
  notificationUpdate.mockResolvedValue({ id: "n1", readAt: new Date() });
});

describe("POST /api/notifications/[id]/read", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await post("n1");
    expect(res.status).toBe(401);
  });

  it("404s on a missing notification", async () => {
    notification = null;
    const res = await post("n1");
    expect(res.status).toBe(404);
  });

  it("404s when the notification belongs to someone else", async () => {
    notification = { id: "n1", userId: "someone-else", readAt: null };
    const res = await post("n1");
    expect(res.status).toBe(404);
  });

  it("marks the notification read", async () => {
    const res = await post("n1");
    expect(res.status).toBe(200);
    expect(notificationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { readAt: expect.any(Date) } }));
  });

  it("is idempotent on an already-read notification", async () => {
    const readAt = new Date("2026-01-01");
    notification = { id: "n1", userId: "u1", readAt };
    await post("n1");
    expect(notificationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { readAt } }));
  });
});
