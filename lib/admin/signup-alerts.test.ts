import { beforeEach, describe, expect, it, vi } from "vitest";

let configRow: { key: string; value: string } | null = null;
const upsert = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: vi.fn(async () => configRow), upsert },
    user: { findMany: vi.fn(async () => [{ email: "a1@clipiro.com" }, { email: "A2@clipiro.com" }]) },
  },
}));
const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));
type Result = { status: string; channel: string | null; messageId: string | null; error?: string };
const ok = async (): Promise<Result> => ({ status: "sent", channel: "resend", messageId: "m1" });
const sendAdminNewSignupEmail = vi.fn(async (_to: string, _d: unknown) => ok());
const sendAdminDailyDigestEmail = vi.fn(async (_to: string, _d: unknown) => ok());
vi.mock("@/lib/email", () => ({ sendAdminNewSignupEmail, sendAdminDailyDigestEmail }));
const buildStaffDigest = vi.fn(async () => ({ signups: 2 }));
vi.mock("@/lib/admin/staff-digest", () => ({ buildStaffDigest }));

const { getSignupAlertSettings, notifyAdminsOfSignup, parseSignupAlertSettings, sendTestSignupAlert, setSignupAlertSettings } =
  await import("./signup-alerts");

const signup = { userId: "u1", email: "new@x.co", name: "New", method: "email" as const };
const sentTo = () => sendAdminNewSignupEmail.mock.calls.map((c) => c[0]);
const store = (v: unknown) => (configRow = { key: "admin_signup_alerts", value: JSON.stringify(v) });
const instant = { signupMode: "instant", moneyAlerts: true, recipients: [], mutedAdmins: [] };

beforeEach(() => {
  configRow = null;
  vi.clearAllMocks();
});

describe("signup alert settings", () => {
  it("defaults to the daily summary with money alerts on", async () => {
    expect(await getSignupAlertSettings()).toEqual({ signupMode: "daily", moneyAlerts: true, recipients: [], mutedAdmins: [] });
  });

  it("falls back to the default on a corrupt row", () => {
    expect(parseSignupAlertSettings("{not json").signupMode).toBe("daily");
    expect(parseSignupAlertSettings("null").signupMode).toBe("daily");
  });

  // Rows saved before 2026-11-19: off stays off; on becomes the daily summary,
  // because one email per signup is exactly what the owner asked to stop.
  it("reads the old { enabled } shape", () => {
    expect(parseSignupAlertSettings(JSON.stringify({ enabled: false, recipients: ["X@y.co"] }))).toEqual({
      signupMode: "off", moneyAlerts: true, recipients: ["x@y.co"], mutedAdmins: [],
    });
    expect(parseSignupAlertSettings(JSON.stringify({ enabled: true, recipients: [] })).signupMode).toBe("daily");
  });

  it("normalises and de-duplicates addresses on save", async () => {
    const saved = await setSignupAlertSettings({
      signupMode: "daily", moneyAlerts: false, recipients: [" Ops@X.co", "ops@x.co", "b@x.co"], mutedAdmins: ["A1@clipiro.com"],
    });
    expect(saved).toEqual({ signupMode: "daily", moneyAlerts: false, recipients: ["ops@x.co", "b@x.co"], mutedAdmins: ["a1@clipiro.com"] });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "admin_signup_alerts" } }));
  });
});

describe("notifyAdminsOfSignup", () => {
  it("sends nothing per signup in the default (daily) mode", async () => {
    await notifyAdminsOfSignup(signup);
    expect(sendAdminNewSignupEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when off", async () => {
    store({ ...instant, signupMode: "off" });
    await notifyAdminsOfSignup(signup);
    expect(sendAdminNewSignupEmail).not.toHaveBeenCalled();
  });

  it("in instant mode emails every admin account plus the extras, de-duplicated", async () => {
    store({ ...instant, recipients: ["ops@x.co", "a1@clipiro.com"] });
    await notifyAdminsOfSignup(signup);
    expect(sentTo()).toEqual(["a1@clipiro.com", "a2@clipiro.com", "ops@x.co"]);
    expect(sendAdminNewSignupEmail).toHaveBeenCalledWith(
      "a1@clipiro.com",
      expect.objectContaining({ userId: "u1", method: "email", signedUpAt: expect.stringContaining("IST") }),
    );
  });

  it("skips an admin who muted themselves", async () => {
    store({ ...instant, mutedAdmins: ["a1@clipiro.com"] });
    await notifyAdminsOfSignup(signup);
    expect(sentTo()).toEqual(["a2@clipiro.com"]);
  });

  it("logs a send the provider didn't accept", async () => {
    store(instant);
    sendAdminNewSignupEmail.mockResolvedValueOnce({ status: "failed", channel: null, messageId: null, error: "422" });
    await notifyAdminsOfSignup(signup);
    expect(warn).toHaveBeenCalledWith("signup-alerts", expect.stringContaining("not sent"), expect.objectContaining({ status: "failed" }));
  });

  it("never throws: one failed inbox doesn't stop the others", async () => {
    store(instant);
    sendAdminNewSignupEmail.mockRejectedValueOnce(new Error("bounced"));
    await expect(notifyAdminsOfSignup(signup)).resolves.toBeUndefined();
    expect(sentTo()).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });
});

describe("sendTestSignupAlert", () => {
  it("sends the real daily summary in daily mode", async () => {
    const results = await sendTestSignupAlert();
    expect(buildStaffDigest).toHaveBeenCalled();
    expect(sendAdminDailyDigestEmail.mock.calls.map((c) => c[0])).toEqual(["a1@clipiro.com", "a2@clipiro.com"]);
    expect(results).toEqual([{ to: "a1@clipiro.com", status: "sent" }, { to: "a2@clipiro.com", status: "sent" }]);
  });

  it("sends the signup template in instant mode and reports each outcome", async () => {
    store({ ...instant, recipients: ["ops@x.co"] });
    sendAdminNewSignupEmail.mockRejectedValueOnce(new Error("boom"));
    expect(await sendTestSignupAlert()).toEqual([
      { to: "a1@clipiro.com", status: "failed", error: "boom" },
      { to: "a2@clipiro.com", status: "sent" },
      { to: "ops@x.co", status: "sent" },
    ]);
    expect(sendAdminDailyDigestEmail).not.toHaveBeenCalled();
  });
});
