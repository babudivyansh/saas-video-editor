import { beforeEach, describe, expect, it, vi } from "vitest";

// refundCredits restores against the confirm-step spend and, if that comes up
// short, tops up the difference with freshly granted credits — a path meant
// only for legacy projects charged before the bucket split, which have no
// ledger rows at all.
//
// A render can refund twice (partial-failure, then the trimmed-duration
// delta), and both amounts are computed from GROSS pricing while the confirm
// charge is net of the analysis credit. So "restored less than asked" is a
// perfectly ordinary outcome on a modern project, and treating it as legacy
// minted credits that were never paid.

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b", GEMINI_API_KEY: "k" },
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));

let ledgerRows = 0;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: vi.fn(async () => null) },
    project: { findUnique: vi.fn(async () => ({ userId: "user-1" })) },
    creditTransaction: { count: vi.fn(async () => ledgerRows) },
  },
}));

/** How much restoreSpend is able to give back — i.e. what is left of the spend. */
let restorable = 0;
const grantCredits = vi.fn(async () => {});
vi.mock("@/lib/credits", () => ({
  restoreSpend: vi.fn(async ({ amount }: { amount: number }) => Math.min(amount, restorable)),
  grantCredits,
  spendCredits: vi.fn(async () => ({ ok: true, balances: { total: 0 } })),
}));

const { refundCredits } = await import("./autoclip-pipeline");

beforeEach(() => {
  grantCredits.mockClear();
});

describe("refundCredits", () => {
  it("does not mint credits when the spend is simply exhausted", async () => {
    ledgerRows = 1; // a normal project: the confirm charge is on the ledger
    restorable = 2; // …but only 2 credits of it are left to give back
    await refundCredits("project-1", 5);
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("still tops up a legacy project that has no ledger rows", async () => {
    ledgerRows = 0;
    restorable = 0;
    await refundCredits("project-1", 4);
    expect(grantCredits).toHaveBeenCalledTimes(1);
    expect(grantCredits.mock.calls[0][0]).toMatchObject({ userId: "user-1", amount: 4 });
  });

  it("is a no-op for a non-positive amount", async () => {
    ledgerRows = 0;
    restorable = 0;
    await refundCredits("project-1", 0);
    expect(grantCredits).not.toHaveBeenCalled();
  });
});
