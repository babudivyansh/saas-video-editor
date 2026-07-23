import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

interface CommissionRow {
  id: string;
  affiliateId: string;
  amount: number;
  status: string;
}

let availableCommissions: CommissionRow[];
let updateManyCalls: Array<{ where: unknown; data: Record<string, unknown> }>;
let affiliateUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }>;
let auditRows: Array<{ action: string; after: string | null }>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commission: {
      findMany: vi.fn(async () => availableCommissions),
      updateMany: vi.fn(async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
        updateManyCalls.push({ where, data });
        return { count: availableCommissions.length };
      }),
    },
    affiliate: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        affiliateUpdates.push({ where, data });
        return { id: where.id, ...data };
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    auditLog: {
      create: vi.fn(async ({ data }: { data: { action: string; after: string | null } }) => {
        auditRows.push({ action: data.action, after: data.after });
        return data;
      }),
    },
  },
}));

const { POST } = await import("./route");

function post(affiliateId: string, body: unknown): [NextRequest, { params: Promise<{ affiliateId: string }> }] {
  return [
    new NextRequest(`http://localhost/api/admin/payouts/${affiliateId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ affiliateId }) },
  ];
}

beforeEach(() => {
  availableCommissions = [
    { id: "c1", affiliateId: "aff-1", amount: 300, status: "available" },
    { id: "c2", affiliateId: "aff-1", amount: 250, status: "available" },
  ];
  updateManyCalls = [];
  affiliateUpdates = [];
  auditRows = [];
  vi.clearAllMocks();
});

describe("POST /api/admin/payouts/[affiliateId]", () => {
  it("sums available commissions, flips them to paid, and increments totalPaid", async () => {
    const res = await POST(...post("aff-1", { payoutRef: "UPI123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.amount).toBe(550);
    expect(data.commissions).toBe(2);

    expect(updateManyCalls[0]).toMatchObject({
      where: { affiliateId: "aff-1", status: "available" },
      data: { status: "paid", payoutRef: "UPI123" },
    });
    expect(affiliateUpdates[0].data.totalPaid).toEqual({ increment: 550 });
    expect(auditRows[0].action).toBe("affiliate.paid");
  });

  it("resets payoutRequestedAt and payoutThresholdNotifiedAt on the affiliate", async () => {
    await POST(...post("aff-1", { payoutRef: "UPI123" }));
    expect(affiliateUpdates[0].data.payoutRequestedAt).toBeNull();
    expect(affiliateUpdates[0].data.payoutThresholdNotifiedAt).toBeNull();
  });

  it("400s when there is nothing available to pay out, and touches nothing", async () => {
    availableCommissions = [];
    const res = await POST(...post("aff-1", { payoutRef: "UPI123" }));
    expect(res.status).toBe(400);
    expect(affiliateUpdates).toHaveLength(0);
    expect(updateManyCalls).toHaveLength(0);
  });
});
