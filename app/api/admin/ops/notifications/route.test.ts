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
const auditAdminAction = vi.fn(async () => {});
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction, auditIp: () => null, auditOnce: vi.fn(async () => false) }));

let stored = { enabled: true, recipients: [] as string[] };
const setSignupAlertSettings = vi.fn(async (s: typeof stored) => (stored = s));
vi.mock("@/lib/admin/signup-alerts", () => ({
  getSignupAlertSettings: vi.fn(async () => stored),
  setSignupAlertSettings,
  adminAccountEmails: vi.fn(async () => ["a1@clipiro.com"]),
}));

const { GET, PATCH } = await import("./route");

const url = "http://localhost/api/admin/ops/notifications";
const patch = (body: unknown) => PATCH(new NextRequest(url, { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  isAdmin = true;
  stored = { enabled: true, recipients: [] };
  vi.clearAllMocks();
});

describe("/api/admin/ops/notifications", () => {
  it("is admin-only", async () => {
    isAdmin = false;
    expect((await GET(new NextRequest(url))).status).toBe(403);
    expect((await patch({ enabled: false, recipients: [] })).status).toBe(403);
    expect(setSignupAlertSettings).not.toHaveBeenCalled();
  });

  it("returns the settings and the admin accounts used by default", async () => {
    const res = await GET(new NextRequest(url));
    expect(await res.json()).toEqual({ signup: { enabled: true, recipients: [] }, adminEmails: ["a1@clipiro.com"] });
  });

  it("saves and audits a change", async () => {
    const res = await patch({ enabled: false, recipients: ["ops@x.co"] });
    expect(res.status).toBe(200);
    expect(setSignupAlertSettings).toHaveBeenCalledWith({ enabled: false, recipients: ["ops@x.co"] });
    expect(auditAdminAction).toHaveBeenCalledWith("admin-1", "signup_alerts.updated", undefined, expect.objectContaining({
      before: { enabled: true, recipients: [] },
      after: { enabled: false, recipients: ["ops@x.co"] },
    }));
  });

  it("rejects an invalid recipient", async () => {
    const res = await patch({ enabled: true, recipients: ["not-an-email"] });
    expect(res.status).toBe(400);
    expect(setSignupAlertSettings).not.toHaveBeenCalled();
  });
});
