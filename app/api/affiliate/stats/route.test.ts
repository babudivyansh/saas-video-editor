// GET /api/affiliate/stats — the affiliate dashboard's data. The part with
// teeth is recentReferrals: it must mask the referred users' emails and must
// not tell an affiliate that a referral was judged fraudulent.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "user-1" })) }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://clipiro.test" } }));

let affiliate: Record<string, unknown> | null;
let recent: Array<Record<string, unknown>>;
let recentArgs: { where?: unknown; take?: number; orderBy?: unknown } = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    affiliate: { findUnique: vi.fn(async () => affiliate) },
    referral: {
      findMany: vi.fn(async (args: typeof recentArgs) => {
        recentArgs = args;
        return recent;
      }),
    },
  },
}));

const { GET } = await import("./route");
const req = () => new NextRequest("http://localhost/api/affiliate/stats");

beforeEach(() => {
  affiliate = {
    id: "aff-1",
    code: "USR-00QP",
    status: "active",
    totalEarned: 840,
    totalPaid: 0,
    referrals: [{ id: "r1", status: "converted" }, { id: "r2", status: "signed_up" }, { id: "r3", status: "fraudulent" }],
    commissions: [{ amount: 580, status: "pending" }, { amount: 260, status: "available" }],
  };
  recent = [
    { id: "r1", status: "converted", signedUpAt: new Date("2026-10-09T10:00:00Z"), referredUser: { email: "alice@gmail.com" }, commissions: [{ amount: 580, status: "pending" }, { amount: 99, status: "rejected" }] },
    { id: "r2", status: "signed_up", signedUpAt: new Date("2026-10-04T10:00:00Z"), referredUser: { email: "rahul@outlook.com" }, commissions: [] },
    { id: "r3", status: "fraudulent", signedUpAt: new Date("2026-09-28T10:00:00Z"), referredUser: { email: "kim@gmail.com" }, commissions: [] },
  ];
  recentArgs = {};
});

describe("GET /api/affiliate/stats", () => {
  it("reports not enrolled without an affiliate row", async () => {
    affiliate = null;
    expect(await (await GET(req())).json()).toEqual({ enrolled: false });
  });

  it("keeps the existing totals", async () => {
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({
      enrolled: true,
      code: "USR-00QP",
      referralLink: "https://clipiro.test/register?ref=USR-00QP",
      totalReferrals: 3,
      convertedReferrals: 1,
      pendingAmount: 580,
      availableAmount: 260,
      totalEarned: 840,
    });
  });

  it("lists recent referrals newest first, scoped to this affiliate", async () => {
    await GET(req());
    expect(recentArgs.where).toEqual({ affiliateId: "aff-1" });
    expect(recentArgs.orderBy).toEqual({ signedUpAt: "desc" });
    expect(recentArgs.take).toBe(9);
  });

  it("masks emails, hides fraud verdicts, and sums non-rejected commission", async () => {
    const { recentReferrals } = await (await GET(req())).json();
    expect(recentReferrals).toEqual([
      { id: "r1", label: "a***@gmail.com", signedUpAt: "2026-10-09T10:00:00.000Z", status: "converted", commission: 580 },
      { id: "r2", label: "r***@outlook.com", signedUpAt: "2026-10-04T10:00:00.000Z", status: "signed_up", commission: 0 },
      { id: "r3", label: "k***@gmail.com", signedUpAt: "2026-09-28T10:00:00.000Z", status: "review", commission: 0 },
    ]);
    expect(JSON.stringify(recentReferrals)).not.toContain("alice@");
  });
});
