import { beforeEach, describe, expect, it, vi } from "vitest";

let configRow: { key: string; value: string } | null = null;
const upsert = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: vi.fn(async () => configRow), upsert },
    user: { findMany: vi.fn(async () => [{ email: "a1@clipiro.com" }, { email: "a2@clipiro.com" }]) },
  },
}));
const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));
type Result = { status: string; channel: string | null; messageId: string | null; error?: string };
const sendAdminNewSignupEmail = vi.fn(
  async (_to: string, _d: unknown): Promise<Result> => ({ status: "sent", channel: "resend", messageId: "m1" }),
);
vi.mock("@/lib/email", () => ({ sendAdminNewSignupEmail }));

const { getSignupAlertSettings, notifyAdminsOfSignup, sendTestSignupAlert, setSignupAlertSettings } = await import("./signup-alerts");

const signup = { userId: "u1", email: "new@x.co", name: "New", method: "email" as const };
const sentTo = () => sendAdminNewSignupEmail.mock.calls.map((c) => c[0]);

beforeEach(() => {
  configRow = null;
  vi.clearAllMocks();
});

describe("signup alert settings", () => {
  it("defaults to on, every admin, when nothing is stored", async () => {
    expect(await getSignupAlertSettings()).toEqual({ enabled: true, recipients: [] });
  });

  it("falls back to the default on a corrupt row", async () => {
    configRow = { key: "admin_signup_alerts", value: "{not json" };
    expect(await getSignupAlertSettings()).toEqual({ enabled: true, recipients: [] });
  });

  it("normalises and de-duplicates recipients on save", async () => {
    const saved = await setSignupAlertSettings({ enabled: true, recipients: [" Ops@X.co", "ops@x.co", "b@x.co"] });
    expect(saved.recipients).toEqual(["ops@x.co", "b@x.co"]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "admin_signup_alerts" } }));
  });
});

describe("notifyAdminsOfSignup", () => {
  it("emails every ADMIN account when no custom list is set", async () => {
    await notifyAdminsOfSignup(signup);
    expect(sentTo()).toEqual(["a1@clipiro.com", "a2@clipiro.com"]);
    expect(sendAdminNewSignupEmail).toHaveBeenCalledWith(
      "a1@clipiro.com",
      expect.objectContaining({ userId: "u1", email: "new@x.co", method: "email", signedUpAt: expect.stringContaining("IST") }),
    );
  });

  // Regression: extras used to REPLACE the admin accounts, so adding one
  // address silently stopped the admins getting the email.
  it("sends to the admin accounts AND the extra addresses, de-duplicated", async () => {
    configRow = {
      key: "admin_signup_alerts",
      value: JSON.stringify({ enabled: true, recipients: ["ops@x.co", "A1@clipiro.com"] }),
    };
    await notifyAdminsOfSignup(signup);
    expect(sentTo()).toEqual(["a1@clipiro.com", "a2@clipiro.com", "ops@x.co"]);
  });

  it("logs a send the provider didn't accept", async () => {
    sendAdminNewSignupEmail.mockResolvedValueOnce({ status: "failed", channel: null, messageId: null, error: "422" });
    await notifyAdminsOfSignup(signup);
    expect(warn).toHaveBeenCalledWith("signup-alerts", expect.stringContaining("not sent"), expect.objectContaining({ status: "failed" }));
  });

  it("sends nothing when switched off", async () => {
    configRow = { key: "admin_signup_alerts", value: JSON.stringify({ enabled: false, recipients: [] }) };
    await notifyAdminsOfSignup(signup);
    expect(sendAdminNewSignupEmail).not.toHaveBeenCalled();
  });

  it("test send reports each recipient's outcome, even when switched off", async () => {
    configRow = { key: "admin_signup_alerts", value: JSON.stringify({ enabled: false, recipients: ["ops@x.co"] }) };
    sendAdminNewSignupEmail.mockRejectedValueOnce(new Error("boom"));
    const results = await sendTestSignupAlert();
    expect(results).toEqual([
      { to: "a1@clipiro.com", status: "failed", error: "boom" },
      { to: "a2@clipiro.com", status: "sent" },
      { to: "ops@x.co", status: "sent" },
    ]);
  });

  it("never throws: one failed inbox doesn't stop the others", async () => {
    sendAdminNewSignupEmail.mockRejectedValueOnce(new Error("bounced"));
    await expect(notifyAdminsOfSignup(signup)).resolves.toBeUndefined();
    expect(sentTo()).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });
});
