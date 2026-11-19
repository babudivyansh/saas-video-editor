import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration test against a real Postgres (DATABASE_URL), like
// lib/coupons.race.test.ts: the guarantee being tested — 100 concurrent
// reservations can never exceed the cap — lives in the conditional upsert's
// row locking, which a mocked client cannot reproduce. Skips without a
// database; CI runs it against its Postgres service.

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("email quota reservation (Postgres)", () => {
  let prisma: typeof import("@/lib/prisma")["prisma"];
  let store: typeof import("./store")["prismaRouterStore"];
  // A period far in the past so nothing real collides with it.
  const period = { type: "day" as const, start: new Date("2001-01-01T00:00:00Z"), end: new Date("2001-01-02T00:00:00Z") };
  const month = { type: "month" as const, start: new Date("2001-01-01T00:00:00Z"), end: new Date("2001-02-01T00:00:00Z") };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ prismaRouterStore: store } = await import("./store"));
    await prisma.emailQuotaUsage.deleteMany({ where: { periodStart: period.start } });
  });

  afterAll(async () => {
    await prisma.emailQuotaUsage.deleteMany({ where: { periodStart: period.start } });
  });

  it("hands out exactly `cap` slots to 100 concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 100 }, () => store.reserveQuota("brevo", period, 30, 30)));
    expect(results.filter(Boolean)).toHaveLength(30);
    const row = await prisma.emailQuotaUsage.findUniqueOrThrow({
      where: { provider_periodType_periodStart: { provider: "brevo", periodType: "day", periodStart: period.start } },
    });
    expect(row.reservedCount).toBe(30);
  });

  it("release frees a slot, and never goes below zero", async () => {
    await store.releaseQuota("brevo", period);
    expect(await store.reserveQuota("brevo", period, 30, 30)).toBe(true);
    expect(await store.reserveQuota("brevo", period, 30, 30)).toBe(false);
    for (let i = 0; i < 40; i++) await store.releaseQuota("brevo", period);
    const row = await prisma.emailQuotaUsage.findFirstOrThrow({ where: { provider: "brevo", periodStart: period.start } });
    expect(row.reservedCount).toBe(0);
  });

  it("an exhausted period refuses every reservation, even under the cap", async () => {
    await store.markExhausted("mailjet", month);
    expect(await store.reserveQuota("mailjet", month, null, null)).toBe(false);
  });

  it("no cap = unlimited, still counted", async () => {
    await Promise.all(Array.from({ length: 10 }, () => store.reserveQuota("resend", period, null, null)));
    const row = await prisma.emailQuotaUsage.findFirstOrThrow({ where: { provider: "resend", periodStart: period.start } });
    expect(row.reservedCount).toBe(10);
    await store.recordQuotaOutcome("resend", period, "accepted");
    const after = await prisma.emailQuotaUsage.findFirstOrThrow({ where: { provider: "resend", periodStart: period.start } });
    expect(after.acceptedCount).toBe(1);
  });
});
