import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }));
vi.mock("@/lib/cron-tracking", () => ({ withCronTracking: (_n: string, h: unknown) => h }));
const sendAdminDailyDigestEmail = vi.fn(async () => ({ status: "sent", channel: "resend", messageId: "m" }));
vi.mock("@/lib/email", () => ({ sendAdminDailyDigestEmail }));
vi.mock("@/lib/admin/staff-digest", () => ({ buildStaffDigest: vi.fn(async () => ({ signups: 4 })) }));
let mode = "daily";
vi.mock("@/lib/admin/signup-alerts", () => ({
  getSignupAlertSettings: vi.fn(async () => ({ signupMode: mode, moneyAlerts: true, recipients: [], mutedAdmins: [] })),
  signupAlertRecipients: vi.fn(async () => ["a1@clipiro.com", "ops@x.co"]),
  sendToEach: async (to: string[], _t: string, send: (a: string) => Promise<{ status: string }>) =>
    Promise.all(to.map(async (a) => ({ to: a, status: (await send(a)).status }))),
}));

const { GET } = await import("./route");
const req = (secret?: string) =>
  new NextRequest("http://localhost/api/cron/admin-daily-digest", secret ? { headers: { "x-cron-secret": secret } } : {});

beforeEach(() => {
  mode = "daily";
  vi.clearAllMocks();
});

describe("/api/cron/admin-daily-digest", () => {
  it("needs the cron secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(sendAdminDailyDigestEmail).not.toHaveBeenCalled();
  });

  it("emails every recipient in daily mode", async () => {
    const res = await GET(req("s3cret"));
    expect(await res.json()).toEqual({ ok: true, sent: 2, recipients: 2, signups: 4 });
  });

  it("skips when signup emails are instant or off", async () => {
    mode = "instant";
    const res = await GET(req("s3cret"));
    expect((await res.json()).skipped).toContain("instant");
    expect(sendAdminDailyDigestEmail).not.toHaveBeenCalled();
  });
});
