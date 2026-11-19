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
vi.mock("@/lib/env", () => ({ env: { EMAIL_ROUTER_ENABLED: "true", EMAIL_FROM: "noreply@clipiro.com", BREVO_API_KEY: "xkeysib-SECRET" } }));

const NOW = new Date();
const dayStart = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));
const monthStart = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));

const providerRows = [
  { provider: "brevo", enabled: true, priority: 1, dailyLimit: 300, monthlyLimit: null, healthStatus: "healthy", consecutiveFailures: 0, circuitBreakerUntil: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, lastErrorMessage: null, lastCheckedAt: null, reportedRemaining: null, reportedAt: null, senderVerified: null },
  { provider: "mailjet", enabled: true, priority: 2, dailyLimit: 200, monthlyLimit: 6000, healthStatus: "unknown", consecutiveFailures: 0, circuitBreakerUntil: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null, lastErrorMessage: null, lastCheckedAt: null, reportedRemaining: null, reportedAt: null, senderVerified: null },
  { provider: "resend", enabled: true, priority: 3, dailyLimit: 100, monthlyLimit: 3000, healthStatus: "quota_exhausted", consecutiveFailures: 0, circuitBreakerUntil: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCode: "daily_quota_exceeded", lastErrorMessage: "x", lastCheckedAt: null, reportedRemaining: null, reportedAt: null, senderVerified: null },
];
const update = vi.fn(async ({ where, data }: { where: { provider: string }; data: object }) => ({ ...providerRows.find((r) => r.provider === where.provider)!, ...data }));
const messageFindMany = vi.fn(async (_args?: unknown) => [{
  id: "m1", userId: "u1", recipientEmail: "alice@gmail.com", templateId: "otp", priority: "critical", status: "accepted",
  provider: "brevo", attemptCount: 1, fallbackUsed: false, createdAt: NOW, acceptedAt: NOW, deliveredAt: null, retryCount: 0, errorCode: null,
}]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailProviderStatus: {
      findMany: vi.fn(async () => providerRows),
      createMany: vi.fn(async () => ({ count: 0 })),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { provider: string } }) => providerRows.find((r) => r.provider === where.provider)),
      update,
    },
    emailQuotaUsage: {
      findMany: vi.fn(async () => [
        { provider: "brevo", periodType: "day", periodStart: dayStart, reservedCount: 216, acceptedCount: 210, rejectedCount: 3, exhaustedAt: null },
        { provider: "resend", periodType: "day", periodStart: dayStart, reservedCount: 40, acceptedCount: 40, rejectedCount: 0, exhaustedAt: NOW },
        { provider: "mailjet", periodType: "month", periodStart: monthStart, reservedCount: 5400, acceptedCount: 5400, rejectedCount: 0, exhaustedAt: null },
      ]),
    },
    emailMessage: { count: vi.fn(async () => 1), findMany: messageFindMany },
    emailAlert: { updateMany: vi.fn(async () => ({ count: 1 })) },
    config: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

const providersRoute = await import("./providers/[provider]/route");
const messagesRoute = await import("./messages/route");
const settingsRoute = await import("./settings/route");
const { getProviderCards } = await import("@/lib/email/router/admin-queries");

const ctx = <P,>(params: P) => ({ params: Promise.resolve(params) });
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${url}`, { method: init?.method ?? "GET", body: init?.body ? JSON.stringify(init.body) : undefined });

beforeEach(() => { isAdmin = true; vi.clearAllMocks(); });

describe("admin email API", () => {
  it("rejects non-admins on every route", async () => {
    isAdmin = false;
    expect((await messagesRoute.GET(req("/api/admin/email/messages"))).status).toBe(403);
    expect((await providersRoute.PATCH(req("/api/admin/email/providers/brevo", { method: "PATCH", body: { enabled: false } }), ctx({ provider: "brevo" }))).status).toBe(403);
    expect((await settingsRoute.PATCH(req("/api/admin/email/settings", { method: "PATCH", body: { pauseNoncritical: true } }))).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("disabling a provider is saved and audited", async () => {
    const res = await providersRoute.PATCH(req("/api/admin/email/providers/brevo", { method: "PATCH", body: { enabled: false } }), ctx({ provider: "brevo" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { provider: "brevo" }, data: { enabled: false } }));
    expect(auditAdminAction).toHaveBeenCalledWith("admin-1", "email_provider.updated", undefined, expect.anything());
  });

  it("clearing a suspension requires a reason", async () => {
    const res = await providersRoute.PATCH(req("/api/admin/email/providers/brevo", { method: "PATCH", body: { clearSuspension: true } }), ctx({ provider: "brevo" }));
    expect(res.status).toBe(400);
  });

  it("rejects unknown providers and fields (no credentials can be written)", async () => {
    expect((await providersRoute.PATCH(req("/api/admin/email/providers/sendgrid", { method: "PATCH", body: { enabled: true } }), ctx({ provider: "sendgrid" }))).status).toBe(404);
    expect((await providersRoute.PATCH(req("/api/admin/email/providers/brevo", { method: "PATCH", body: { apiKey: "x" } }), ctx({ provider: "brevo" }))).status).toBe(400);
  });

  it("the activity list masks recipients and leaks no payload or key", async () => {
    const res = await messagesRoute.GET(req("/api/admin/email/messages?page=1&pageSize=25&status=accepted"));
    const body = await res.json();
    expect(body.rows[0].recipient).toBe("a***@gmail.com");
    const text = JSON.stringify(body);
    expect(text).not.toContain("alice@gmail.com");
    expect(text).not.toMatch(/payload|idempotency|xkeysib/i);
  });

  it("caps the page size and applies filters server-side", async () => {
    expect((await messagesRoute.GET(req("/api/admin/email/messages?pageSize=500"))).status).toBe(400);
    await messagesRoute.GET(req("/api/admin/email/messages?provider=mailjet&priority=critical&page=3&pageSize=10"));
    expect(messageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ provider: "mailjet", priority: "critical" }), skip: 20, take: 10,
    }));
  });

  it("priority reorder must name each provider once", async () => {
    expect((await settingsRoute.PATCH(req("/api/admin/email/settings", { method: "PATCH", body: { priority: ["brevo", "brevo", "resend"] } }))).status).toBe(400);
    expect((await settingsRoute.PATCH(req("/api/admin/email/settings", { method: "PATCH", body: { priority: ["mailjet", "brevo", "resend"] } }))).status).toBe(200);
    expect(auditAdminAction).toHaveBeenCalledWith("admin-1", "email_settings.updated", undefined, expect.anything());
  });
});

describe("provider cards", () => {
  it("computes usage, estimated remaining and thresholds, and never calls a provider healthy on credentials alone", async () => {
    const cards = await getProviderCards(NOW);
    const brevo = cards.find((c) => c.provider === "brevo")!;
    expect(brevo.daily).toMatchObject({ used: 216, limit: 300, remaining: 84, pct: 72, exhausted: false });
    expect(brevo.quotaLevel).toBe("warning");
    expect(brevo.configured).toBe(true);

    const mailjet = cards.find((c) => c.provider === "mailjet")!;
    expect(mailjet.configured).toBe(false); // no MAILJET keys in env
    expect(mailjet.status).toBe("not_configured");
    expect(mailjet.monthly).toMatchObject({ used: 5400, limit: 6000, pct: 90 });

    const resend = cards.find((c) => c.provider === "resend")!;
    expect(resend.daily.exhausted).toBe(true); // provider said so, though 40 < 100
    expect(JSON.stringify(cards)).not.toContain("SECRET");
  });
});
