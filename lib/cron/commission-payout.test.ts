import { beforeEach, describe, expect, it, vi } from "vitest";

const sendCommissionAvailableEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendCommissionAvailableEmail }));

const notifyAdminsIfPayoutEligible = vi.fn(async () => {});
vi.mock("@/lib/affiliate", () => ({ notifyAdminsIfPayoutEligible }));

interface DueCommission {
  id: string;
  affiliateId: string;
  amount: number;
  affiliate: { user: { email: string; firstName: string | null; name: string | null } };
}

let dueCommissions: DueCommission[];
let updatedCommissions: Array<{ id: string; data: Record<string, unknown> }>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commission: {
      findMany: vi.fn(async () => dueCommissions),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updatedCommissions.push({ id: where.id, data });
        return { id: where.id, ...data };
      }),
    },
  },
}));

const { runCommissionPayoutSweep } = await import("./commission-payout");

function makeCommission(overrides: Partial<DueCommission> = {}): DueCommission {
  return {
    id: "c1",
    affiliateId: "aff-1",
    amount: 250,
    affiliate: { user: { email: "aff@test.com", firstName: "Aff", name: null } },
    ...overrides,
  };
}

beforeEach(() => {
  dueCommissions = [];
  updatedCommissions = [];
  vi.clearAllMocks();
  sendCommissionAvailableEmail.mockReset();
  sendCommissionAvailableEmail.mockImplementation(async () => {});
  notifyAdminsIfPayoutEligible.mockReset();
  notifyAdminsIfPayoutEligible.mockImplementation(async () => {});
});

describe("runCommissionPayoutSweep", () => {
  it("flips due commissions to available, emails the affiliate, and reports the count", async () => {
    dueCommissions = [makeCommission()];

    const result = await runCommissionPayoutSweep();

    expect(result.notified).toBe(1);
    expect(result.errors).toBe(0);
    expect(updatedCommissions[0]).toEqual({ id: "c1", data: { status: "available", payoutEmailSent: true } });
    expect(sendCommissionAvailableEmail).toHaveBeenCalledWith("aff@test.com", "Aff", 250);
  });

  it("notifies admins for the affiliate of each swept commission", async () => {
    dueCommissions = [
      makeCommission({ id: "c1", affiliateId: "aff-1" }),
      makeCommission({ id: "c2", affiliateId: "aff-2" }),
    ];

    await runCommissionPayoutSweep();

    expect(notifyAdminsIfPayoutEligible).toHaveBeenCalledWith("aff-1");
    expect(notifyAdminsIfPayoutEligible).toHaveBeenCalledWith("aff-2");
    expect(notifyAdminsIfPayoutEligible).toHaveBeenCalledTimes(2);
  });

  it("a notify failure is swallowed — it does not count as a sweep error and the flip already succeeded", async () => {
    dueCommissions = [makeCommission()];
    notifyAdminsIfPayoutEligible.mockRejectedValueOnce(new Error("email provider down"));

    const result = await runCommissionPayoutSweep();

    expect(result.notified).toBe(1);
    expect(result.errors).toBe(0);
    expect(updatedCommissions[0].data.status).toBe("available");
  });

  it("a commission-level failure (e.g. affiliate email throws) counts as an error and never reaches notify", async () => {
    dueCommissions = [makeCommission()];
    sendCommissionAvailableEmail.mockRejectedValueOnce(new Error("smtp down"));

    const result = await runCommissionPayoutSweep();

    expect(result.errors).toBe(1);
    expect(result.notified).toBe(0);
    expect(updatedCommissions).toHaveLength(0);
    expect(notifyAdminsIfPayoutEligible).not.toHaveBeenCalled();
  });
});
