import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1" })),
}));

const notifyAdminsIfPayoutEligible = vi.fn(async () => {});
vi.mock("@/lib/affiliate", () => ({ notifyAdminsIfPayoutEligible }));

interface MockAffiliate {
  id: string;
  code: string;
  commissions: Array<{ amount: number }>;
}

let affiliate: MockAffiliate | null;
let affiliateUpdates: Array<{ id: string; data: Record<string, unknown> }>;
let auditRows: Array<{ action: string; after: string | null }>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    affiliate: {
      findUnique: vi.fn(async () => affiliate),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        affiliateUpdates.push({ id: where.id, data });
        return { id: where.id, ...data };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: { action: string; after: string | null } }) => {
        auditRows.push({ action: data.action, after: data.after });
        return data;
      }),
    },
  },
}));

const { POST } = await import("./route");

function post(): NextRequest {
  return new NextRequest("http://localhost/api/affiliate/payout-request", { method: "POST" });
}

beforeEach(() => {
  affiliate = { id: "aff-1", code: "JOH-N4X2", commissions: [{ amount: 300 }, { amount: 250 }] };
  affiliateUpdates = [];
  auditRows = [];
  vi.clearAllMocks();
  notifyAdminsIfPayoutEligible.mockReset();
  notifyAdminsIfPayoutEligible.mockImplementation(async () => {});
});

describe("POST /api/affiliate/payout-request", () => {
  it("400s with the threshold-aware message when under the minimum", async () => {
    affiliate!.commissions = [{ amount: 100 }];
    const res = await POST(post());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Minimum payout is ₹500");
    expect(data.error).toContain("₹100.00");
    expect(affiliateUpdates).toHaveLength(0);
  });

  it("400s when the user isn't enrolled as an affiliate", async () => {
    affiliate = null;
    const res = await POST(post());
    expect(res.status).toBe(400);
  });

  it("on success: sets payoutRequestedAt, writes an audit row, and notifies admins with the requested trigger", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.amount).toBe(550);

    expect(affiliateUpdates[0]).toMatchObject({ id: "aff-1", data: { payoutRequestedAt: expect.any(Date) } });
    expect(auditRows[0]).toMatchObject({ action: "affiliate.payout_requested" });
    expect(notifyAdminsIfPayoutEligible).toHaveBeenCalledWith("aff-1", "requested");
  });
});
