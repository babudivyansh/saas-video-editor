import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" })),
}));

interface CommissionRow {
  id: string;
  affiliateId: string;
  amount: number;
  status: string;
}
let commission: CommissionRow;
let totalEarnedDecrements: number[];
let auditRows: Array<{ action: string; after: string | null }>;

const tx = {
  commission: {
    findUnique: vi.fn(async () => commission),
    update: vi.fn(async ({ data }: { data: Partial<CommissionRow> }) => {
      commission = { ...commission, ...data };
      return commission;
    }),
  },
  affiliate: {
    update: vi.fn(async ({ data }: { data: { totalEarned: { decrement: number } } }) => {
      totalEarnedDecrements.push(data.totalEarned.decrement);
      return {};
    }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    auditLog: {
      create: vi.fn(async ({ data }: { data: { action: string; after: string | null } }) => {
        auditRows.push({ action: data.action, after: data.after });
        return data;
      }),
    },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));

const { POST } = await import("./route");

function post(body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest("http://localhost/api/admin/commissions/c1", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-forwarded-for": "1.2.3.4" },
    }),
    { params: Promise.resolve({ id: "c1" }) },
  ];
}

beforeEach(() => {
  commission = { id: "c1", affiliateId: "a1", amount: 250, status: "pending" };
  totalEarnedDecrements = [];
  auditRows = [];
  vi.clearAllMocks();
});

describe("commission release", () => {
  it("releases a pending commission and writes an audit row", async () => {
    const res = await POST(...post({ action: "release" }));
    expect(res.status).toBe(200);
    expect(commission.status).toBe("available");
    expect(auditRows[0].action).toBe("commission.released");
  });

  it("refuses to release a non-pending commission", async () => {
    commission.status = "paid";
    const res = await POST(...post({ action: "release" }));
    expect(res.status).toBe(409);
  });
});

describe("commission reject", () => {
  it("rejects and decrements totalEarned exactly once, with audit + reason + ip", async () => {
    const res = await POST(...post({ action: "reject", reason: "fraudulent referral" }));
    expect(res.status).toBe(200);
    expect(commission.status).toBe("rejected");
    expect(totalEarnedDecrements).toEqual([250]);
    expect(auditRows[0].action).toBe("commission.rejected");
    expect(auditRows[0].after).toContain("fraudulent referral");
    expect(auditRows[0].after).toContain("1.2.3.4");
  });

  it("a second reject returns 409 and does NOT decrement again (double-decrement bug guard)", async () => {
    await POST(...post({ action: "reject" }));
    const res2 = await POST(...post({ action: "reject" }));
    expect(res2.status).toBe(409);
    expect(totalEarnedDecrements).toEqual([250]);
  });

  it("rejects an invalid action with 400 validation issues", async () => {
    const res = await POST(...post({ action: "approve" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
  });
});
