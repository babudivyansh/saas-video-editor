import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The day-before trial notice is the warning of a mandate's first charge. It
// must reach every trialist (it used to be skipped for anyone who had turned
// off credit alerts) and quote the charge in the currency the subscription
// actually bills in.

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "cron" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/cron-tracking", () => ({ recordCronRun: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: vi.fn(async () => false) })); // everything opted out
vi.mock("@/lib/currency", () => ({
  getPlanPriceMinor: vi.fn(async (_slug: string, paise: number, currency: string) => (currency === "USD" ? 2900 : paise)),
}));

const trialEnding = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({
  sendSubscriptionExpiryWarningEmail: vi.fn(async () => {}),
  sendSubscriptionExpiredEmail: vi.fn(async () => {}),
  sendTrialEndingEmail: (...a: unknown[]) => (trialEnding as unknown as (...x: unknown[]) => unknown)(...a),
}));

type TrialRow = { id: string; email: string; firstName: string | null; name: string | null; trialEndsAt: Date; subscriptionCurrency: string | null; plan: { name: string; slug: string; priceInPaise: number } };
let trials: TrialRow[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ("trialEndsAt" in where ? trials : [])),
      update: vi.fn(async () => ({})),
    },
    plan: { findUnique: vi.fn(async () => null) },
  },
}));

const { GET } = await import("./route");
const run = () => GET(new NextRequest("http://localhost/api/cron/subscription-reminder", { headers: { authorization: "Bearer cron" } }));
const row = (over: Partial<TrialRow> = {}): TrialRow => ({
  id: "u1", email: "t@test.com", firstName: "T", name: null, trialEndsAt: new Date(Date.now() + 86_400_000),
  subscriptionCurrency: "INR", plan: { name: "Pro (Monthly)", slug: "sub_pro_1mo", priceInPaise: 219900 }, ...over,
});

beforeEach(() => { vi.clearAllMocks(); trials = []; });

describe("cron/subscription-reminder — trial ending tomorrow", () => {
  it("warns every trialist, even one who turned off credit alerts", async () => {
    trials = [row()];
    const res = await run();
    expect(res.status).toBe(200);
    expect(trialEnding).toHaveBeenCalledTimes(1);
    expect(trialEnding).toHaveBeenCalledWith("t@test.com", "T", "Pro (Monthly)", 219900, expect.any(Date), "INR");
  });

  it("quotes a USD subscription's charge in dollars", async () => {
    trials = [row({ subscriptionCurrency: "USD" })];
    await run();
    expect(trialEnding).toHaveBeenCalledWith("t@test.com", "T", "Pro (Monthly)", 2900, expect.any(Date), "USD");
  });

  it("defaults to INR when the subscription currency is unknown", async () => {
    trials = [row({ subscriptionCurrency: null })];
    await run();
    expect(trialEnding).toHaveBeenCalledWith("t@test.com", "T", "Pro (Monthly)", 219900, expect.any(Date), "INR");
  });
});
