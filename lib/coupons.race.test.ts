import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration test against a real Postgres instance (DATABASE_URL), since the
// bug this guards against is a genuine DB-level race — a mocked prisma client
// can't reproduce it. Skips gracefully when no database is reachable; CI (see
// .github/workflows/ci.yml) runs this against a Postgres service container.
//
// EXPECTED TO FAIL until Branch 2 (H7) adds `@@unique([couponId, userId])` to
// CouponRedemption — that's intentional, this is the regression guard for the
// fix, written ahead of it per the agreed "tests first" sequencing.

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("coupon perUserLimit race (H7 regression guard)", () => {
  let couponId: string;
  let userId: string;
  let prisma: typeof import("@/lib/prisma")["prisma"];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    const suffix = Date.now();
    const user = await prisma.user.create({
      data: { email: `coupon-race-${suffix}@test.local`, passwordHash: "not-a-real-hash" },
    });
    userId = user.id;
    const coupon = await prisma.coupon.create({
      data: { code: `RACE${suffix}`, discountValue: 10, perUserLimit: 1 },
    });
    couponId = coupon.id;
  });

  afterAll(async () => {
    await prisma.couponRedemption.deleteMany({ where: { couponId } });
    await prisma.coupon.delete({ where: { id: couponId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  // it.fails: this assertion is expected to fail until Branch 2 (H7) lands.
  // Once the unique constraint is added, remove `.fails` so this becomes a
  // real regression test instead of a forward-reference placeholder.
  it.fails("only allows one redemption per user even when two requests race", async () => {
    const redeem = () =>
      prisma.couponRedemption
        .create({ data: { couponId, userId, discountInPaise: 100 } })
        .then(() => true)
        .catch(() => false);

    const [a, b] = await Promise.all([redeem(), redeem()]);
    const successCount = [a, b].filter(Boolean).length;

    expect(successCount).toBe(1);
  });
});
