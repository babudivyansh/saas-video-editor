import { beforeEach, describe, expect, it, vi } from "vitest";

let user: Record<string, unknown> | null;
const claims = new Map<string, number>();
const sendLowMinutesEmail = vi.hoisted(() => vi.fn(async () => ({ status: "sent" })));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(async () => user) } } }));
vi.mock("@/lib/redis", () => ({
  redis: {
    incrWithExpire: vi.fn(async (key: string) => {
      const n = (claims.get(key) ?? 0) + 1;
      claims.set(key, n);
      return n;
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/email", () => ({ sendLowMinutesEmail }));

const { fireLowMinutesEmail } = await import("./minute-events");
const { isLowMinutes } = await import("./plans/tiers");
const settle = () => new Promise((r) => setTimeout(r, 20));

const creator = (over: Record<string, unknown> = {}) => ({
  email: "a@test.invalid", firstName: "A", name: null, monthlyMinutes: 150,
  subscriptionEndsAt: new Date(Date.now() + 86400_000), plan: { tier: "creator", kind: "subscription" }, ...over,
});

describe("isLowMinutes", () => {
  it("is low at or under ~20% of the month, never at zero or with no allowance", () => {
    expect(isLowMinutes(30, 150)).toBe(true);
    expect(isLowMinutes(31, 150)).toBe(false);
    expect(isLowMinutes(0, 150)).toBe(false);
    expect(isLowMinutes(5, 0)).toBe(false);
    expect(isLowMinutes(6, 30)).toBe(true);
  });
});

describe("fireLowMinutesEmail", () => {
  beforeEach(() => { claims.clear(); sendLowMinutesEmail.mockClear(); user = creator(); });

  it("emails once when a spend crosses the line, and not again that cycle", async () => {
    fireLowMinutesEmail("u1", 28);
    await settle();
    fireLowMinutesEmail("u1", 20);
    await settle();
    expect(sendLowMinutesEmail).toHaveBeenCalledTimes(1);
    expect(sendLowMinutesEmail).toHaveBeenCalledWith("a@test.invalid", "A", 28, "creator");
  });

  it("stays quiet above the threshold", async () => {
    fireLowMinutesEmail("u1", 90);
    await settle();
    expect(sendLowMinutesEmail).not.toHaveBeenCalled();
  });

  it("measures a free account against the free monthly grant, with the free CTA tier", async () => {
    user = creator({ plan: null, subscriptionEndsAt: null, monthlyMinutes: 0 });
    fireLowMinutesEmail("u2", 5);
    await settle();
    expect(sendLowMinutesEmail).toHaveBeenCalledWith("a@test.invalid", "A", 5, "free");
  });
});
