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
let allowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed, remaining: allowed ? 4 : 0 })),
  getClientIp: () => "127.0.0.1",
}));
const auditAdminAction = vi.fn(async () => {});
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction, auditIp: () => null, auditOnce: vi.fn(async () => false) }));
const results = [{ to: "a1@clipiro.com", status: "sent" }];
const sendTestSignupAlert = vi.fn(async () => results);
vi.mock("@/lib/admin/signup-alerts", () => ({ sendTestSignupAlert }));

const { POST } = await import("./route");

const post = () => POST(new NextRequest("http://localhost/api/admin/ops/notifications/test", { method: "POST" }));

beforeEach(() => {
  isAdmin = true;
  allowed = true;
  vi.clearAllMocks();
});

describe("POST /api/admin/ops/notifications/test", () => {
  it("is admin-only", async () => {
    isAdmin = false;
    expect((await post()).status).toBe(403);
    expect(sendTestSignupAlert).not.toHaveBeenCalled();
  });

  it("sends, returns each outcome and audits it", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results });
    expect(auditAdminAction).toHaveBeenCalledWith("admin-1", "signup_alerts.test_sent", undefined, expect.objectContaining({
      after: { results },
    }));
  });

  it("is rate-limited", async () => {
    allowed = false;
    expect((await post()).status).toBe(429);
    expect(sendTestSignupAlert).not.toHaveBeenCalled();
  });
});
