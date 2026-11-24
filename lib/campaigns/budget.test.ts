import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email/router/config", () => ({ routerEnabled: () => false }));
vi.mock("@/lib/email/router/admin-queries", () => ({ getProviderCards: vi.fn() }));
vi.mock("@/lib/email/router/deliver", () => ({ isNoncriticalPaused: vi.fn() }));

const { combineBudget, quotaHeadroom, BATCH_PER_RUN } = await import("./budget");

const card = (o: Partial<{ configured: boolean; enabled: boolean; status: string; limit: number | null; remaining: number | null; monthly: number | null }>) => ({
  configured: o.configured ?? true,
  enabled: o.enabled ?? true,
  status: o.status ?? "healthy",
  daily: { limit: o.limit === undefined ? 300 : o.limit, remaining: o.remaining === undefined ? 300 : o.remaining },
  monthly: { remaining: o.monthly ?? null },
});

describe("quotaHeadroom", () => {
  it("adds up what usable providers have left and holds 40% of their daily total back", () => {
    const h = quotaHeadroom([card({ limit: 300, remaining: 250 }), card({ limit: 200, remaining: 200, monthly: 50 }), card({ limit: 100, remaining: 100 })]);
    expect(h.spare).toBe(250 + 50 + 100);
    expect(h.reserve).toBe(Math.ceil(600 * 0.4));
  });

  it("ignores unconfigured, disabled and exhausted providers", () => {
    const h = quotaHeadroom([
      card({ configured: false }),
      card({ enabled: false }),
      card({ status: "quota_exhausted" }),
      card({ limit: 100, remaining: 80 }),
    ]);
    expect(h).toEqual({ spare: 80, reserve: 40 });
  });

  it("has nothing to spend with no usable provider", () => {
    expect(quotaHeadroom([card({ configured: false })])).toEqual({ spare: 0, reserve: 0 });
  });

  it("reports unlimited when a provider has no limits", () => {
    expect(quotaHeadroom([card({ limit: null, remaining: null })]).spare).toBeNull();
  });
});

describe("combineBudget", () => {
  const base = { paused: false, dailyCap: 150, sentToday: 0, providerSpare: 500, reserve: 240 };

  it("never exceeds one batch, the cap left, or the spare quota above the reserve", () => {
    expect(combineBudget(base)).toEqual({ allowed: BATCH_PER_RUN, blockedBy: null });
    expect(combineBudget({ ...base, sentToday: 140 })).toEqual({ allowed: 10, blockedBy: null });
    expect(combineBudget({ ...base, providerSpare: 250 })).toEqual({ allowed: 10, blockedBy: null });
  });

  it("says why it is blocked", () => {
    expect(combineBudget({ ...base, paused: true }).blockedBy).toBe("paused");
    expect(combineBudget({ ...base, sentToday: 150 }).blockedBy).toBe("daily_cap");
    expect(combineBudget({ ...base, providerSpare: 240 }).blockedBy).toBe("quota");
    expect(combineBudget({ ...base, dailyCap: 0 }).allowed).toBe(0);
  });

  it("uses only the cap when quota is unknown", () => {
    expect(combineBudget({ ...base, providerSpare: null, sentToday: 120 })).toEqual({ allowed: 30, blockedBy: null });
  });
});
