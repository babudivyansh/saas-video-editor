import { beforeEach, describe, expect, it, vi } from "vitest";

const sendAffiliateReferralSignupEmail = vi.fn(async () => {});
const sendAdminAffiliatePayoutReadyEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendAffiliateReferralSignupEmail, sendAdminAffiliatePayoutReadyEmail }));

interface MockAffiliate {
  id: string;
  code: string;
  status: string;
  codeExpiresAt: Date | null;
  payoutThresholdNotifiedAt?: Date | null;
  user: { id: string; email: string; phone: string | null; firstName: string | null; name: string | null };
}

let affiliateByCode: Map<string, MockAffiliate>;
let affiliateById: Map<string, MockAffiliate>;
let availableSumByAffiliateId: Map<string, number>;
let adminUsers: Array<{ email: string }>;
let referralsByAffiliateId: Map<string, { signupIp: string | null; signedUpAt: Date }[]>;
let createdReferrals: Array<{ affiliateId: string; referredUserId: string; status: string; signupIp: string | null }>;
let userUpdates: Array<{ id: string; data: Record<string, unknown> }>;
let affiliateUpdates: Array<{ id: string; data: Record<string, unknown> }>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    affiliate: {
      findUnique: vi.fn(async ({ where }: { where: { code?: string; id?: string } }) => {
        if (where.code) return affiliateByCode.get(where.code) ?? null;
        if (where.id) return affiliateById.get(where.id) ?? null;
        return null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        affiliateUpdates.push({ id: where.id, data });
        const existing = affiliateById.get(where.id);
        if (existing) affiliateById.set(where.id, { ...existing, ...data });
        return { id: where.id, ...data };
      }),
    },
    commission: {
      aggregate: vi.fn(async ({ where }: { where: { affiliateId: string } }) => ({
        _sum: { amount: availableSumByAffiliateId.get(where.affiliateId) ?? 0 },
      })),
    },
    referral: {
      findFirst: vi.fn(async ({ where }: { where: { affiliateId: string } }) => {
        const rows = referralsByAffiliateId.get(where.affiliateId) ?? [];
        return rows.length ? rows[rows.length - 1] : null;
      }),
      create: vi.fn(async ({ data }: { data: { affiliateId: string; referredUserId: string; status: string; signupIp: string | null } }) => {
        createdReferrals.push(data);
        return { id: "ref-1", ...data };
      }),
      count: vi.fn(async () => createdReferrals.length),
    },
    user: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        userUpdates.push({ id: where.id, data });
        return { id: where.id, ...data };
      }),
      findMany: vi.fn(async () => adminUsers),
    },
  },
}));

const { resolveReferralCode, attributeReferral, notifyAdminsIfPayoutEligible } = await import("./affiliate");

function makeAffiliate(overrides: Partial<MockAffiliate> = {}): MockAffiliate {
  return {
    id: "aff-1",
    code: "JOH-N4X2",
    status: "active",
    codeExpiresAt: null,
    payoutThresholdNotifiedAt: null,
    user: { id: "owner-1", email: "owner@test.com", phone: "+911234567890", firstName: "Owner", name: "Owner Name" },
    ...overrides,
  };
}

beforeEach(() => {
  affiliateByCode = new Map();
  affiliateById = new Map();
  availableSumByAffiliateId = new Map();
  adminUsers = [];
  referralsByAffiliateId = new Map();
  createdReferrals = [];
  userUpdates = [];
  affiliateUpdates = [];
  vi.clearAllMocks();
  sendAdminAffiliatePayoutReadyEmail.mockReset();
  sendAdminAffiliatePayoutReadyEmail.mockImplementation(async () => {});
});

describe("resolveReferralCode", () => {
  it("returns null when neither a cookie nor a typed code is present", async () => {
    const result = await resolveReferralCode({ cookieCode: null, typedCode: null, email: "new@test.com" });
    expect(result).toBeNull();
  });

  it("rejects as duplicate when the cookie and typed code differ", async () => {
    const result = await resolveReferralCode({
      cookieCode: "AAA-1111",
      typedCode: "BBB-2222",
      email: "new@test.com",
    });
    expect(result).toEqual({ applied: false, reason: "duplicate" });
  });

  it("treats a matching cookie + typed code (case-insensitive) as a normal single code, not a duplicate", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate());
    const result = await resolveReferralCode({
      cookieCode: "JOH-N4X2",
      typedCode: "joh-n4x2",
      email: "new@test.com",
    });
    expect(result?.applied).toBe(true);
  });

  it("rejects an unknown code as invalid", async () => {
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "GHOST-1", email: "new@test.com" });
    expect(result).toEqual({ applied: false, reason: "invalid" });
  });

  it("rejects a suspended affiliate's code as invalid", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate({ status: "suspended" }));
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "JOH-N4X2", email: "new@test.com" });
    expect(result).toEqual({ applied: false, reason: "invalid" });
  });

  it("rejects a banned affiliate's code as invalid", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate({ status: "banned" }));
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "JOH-N4X2", email: "new@test.com" });
    expect(result).toEqual({ applied: false, reason: "invalid" });
  });

  it("rejects an expired code", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate({ codeExpiresAt: new Date(Date.now() - 86400000) }));
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "JOH-N4X2", email: "new@test.com" });
    expect(result).toEqual({ applied: false, reason: "expired" });
  });

  it("accepts a code whose expiry is in the future", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate({ codeExpiresAt: new Date(Date.now() + 86400000) }));
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "JOH-N4X2", email: "new@test.com" });
    expect(result?.applied).toBe(true);
  });

  it("rejects self-referral by matching email", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate());
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "JOH-N4X2", email: "OWNER@test.com" });
    expect(result).toEqual({ applied: false, reason: "self" });
  });

  it("rejects self-referral by matching phone", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate());
    const result = await resolveReferralCode({
      cookieCode: null,
      typedCode: "JOH-N4X2",
      email: "different@test.com",
      phone: "+911234567890",
    });
    expect(result).toEqual({ applied: false, reason: "self" });
  });

  it("does not false-positive self-referral when phone is absent", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate({ user: { id: "owner-1", email: "owner@test.com", phone: null, firstName: "Owner", name: null } }));
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "JOH-N4X2", email: "different@test.com", phone: null });
    expect(result?.applied).toBe(true);
  });

  it("resolves a clean happy-path code", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate());
    const result = await resolveReferralCode({ cookieCode: null, typedCode: "JOH-N4X2", email: "new@test.com" });
    expect(result).toEqual({
      applied: true,
      code: "JOH-N4X2",
      affiliateId: "aff-1",
      affiliateUser: { userId: "owner-1", email: "owner@test.com", firstName: "Owner", name: "Owner Name" },
    });
  });
});

describe("attributeReferral", () => {
  it("creates a signed_up referral and notifies the affiliate on a clean match", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate());
    const result = await attributeReferral({
      cookieCode: "JOH-N4X2",
      typedCode: null,
      email: "new@test.com",
      newUser: { id: "new-user-1", firstName: "New", name: "New User" },
      signupIp: "1.2.3.4",
    });

    expect(result?.applied).toBe(true);
    expect(createdReferrals).toEqual([
      { affiliateId: "aff-1", referredUserId: "new-user-1", status: "signed_up", signupIp: "1.2.3.4" },
    ]);
    expect(userUpdates).toEqual([{ id: "new-user-1", data: { referredBy: "aff-1" } }]);
    expect(sendAffiliateReferralSignupEmail).toHaveBeenCalledWith("owner@test.com", "Owner", "New", 1);
  });

  it("flags the referral and suppresses the email when the signup IP matches the affiliate's most recent referral subnet", async () => {
    affiliateByCode.set("JOH-N4X2", makeAffiliate());
    referralsByAffiliateId.set("aff-1", [{ signupIp: "1.2.3.9", signedUpAt: new Date() }]);

    const result = await attributeReferral({
      cookieCode: "JOH-N4X2",
      typedCode: null,
      email: "new@test.com",
      newUser: { id: "new-user-1", firstName: "New", name: "New User" },
      signupIp: "1.2.3.4", // same /24 as 1.2.3.9
    });

    expect(result?.applied).toBe(true);
    expect(createdReferrals[0].status).toBe("flagged");
    expect(sendAffiliateReferralSignupEmail).not.toHaveBeenCalled();
  });

  it("does not create a referral or touch the user when resolution is rejected", async () => {
    const result = await attributeReferral({
      cookieCode: null,
      typedCode: "GHOST-1",
      email: "new@test.com",
      newUser: { id: "new-user-1", firstName: "New", name: "New User" },
      signupIp: "1.2.3.4",
    });

    expect(result).toEqual({ applied: false, reason: "invalid" });
    expect(createdReferrals).toHaveLength(0);
    expect(userUpdates).toHaveLength(0);
  });

  it("returns null and never throws when the underlying lookup fails", async () => {
    vi.mocked((await import("@/lib/prisma")).prisma.affiliate.findUnique).mockRejectedValueOnce(new Error("db down"));
    const result = await attributeReferral({
      cookieCode: "JOH-N4X2",
      typedCode: null,
      email: "new@test.com",
      newUser: { id: "new-user-1", firstName: "New", name: "New User" },
      signupIp: "1.2.3.4",
    });
    expect(result).toBeNull();
  });
});

describe("notifyAdminsIfPayoutEligible", () => {
  it("no-ops when the affiliate isn't found", async () => {
    await notifyAdminsIfPayoutEligible("missing-id");
    expect(sendAdminAffiliatePayoutReadyEmail).not.toHaveBeenCalled();
  });

  it("no-ops when already notified", async () => {
    affiliateById.set("aff-1", makeAffiliate({ payoutThresholdNotifiedAt: new Date() }));
    availableSumByAffiliateId.set("aff-1", 1000);
    adminUsers = [{ email: "admin@test.com" }];
    await notifyAdminsIfPayoutEligible("aff-1");
    expect(sendAdminAffiliatePayoutReadyEmail).not.toHaveBeenCalled();
  });

  it("no-ops when the available balance is under the threshold", async () => {
    affiliateById.set("aff-1", makeAffiliate());
    availableSumByAffiliateId.set("aff-1", 100);
    adminUsers = [{ email: "admin@test.com" }];
    await notifyAdminsIfPayoutEligible("aff-1");
    expect(sendAdminAffiliatePayoutReadyEmail).not.toHaveBeenCalled();
  });

  it("emails every admin and sets the notified flag on the happy path", async () => {
    affiliateById.set("aff-1", makeAffiliate());
    availableSumByAffiliateId.set("aff-1", 750);
    adminUsers = [{ email: "admin1@test.com" }, { email: "admin2@test.com" }];

    await notifyAdminsIfPayoutEligible("aff-1", "threshold");

    expect(sendAdminAffiliatePayoutReadyEmail).toHaveBeenCalledTimes(2);
    expect(sendAdminAffiliatePayoutReadyEmail).toHaveBeenCalledWith(
      "admin1@test.com",
      expect.objectContaining({ trigger: "threshold", availableAmount: 750, affiliateCode: "JOH-N4X2" }),
    );
    expect(affiliateUpdates.find(u => u.id === "aff-1")?.data.payoutThresholdNotifiedAt).toBeInstanceOf(Date);
  });

  it("one admin send failing doesn't block the others, and the flag still gets set", async () => {
    affiliateById.set("aff-1", makeAffiliate());
    availableSumByAffiliateId.set("aff-1", 750);
    adminUsers = [{ email: "bad@test.com" }, { email: "good@test.com" }];
    sendAdminAffiliatePayoutReadyEmail.mockRejectedValueOnce(new Error("smtp down"));

    await notifyAdminsIfPayoutEligible("aff-1");

    expect(sendAdminAffiliatePayoutReadyEmail).toHaveBeenCalledTimes(2);
    expect(affiliateUpdates.some(u => u.id === "aff-1" && u.data.payoutThresholdNotifiedAt)).toBe(true);
  });

  it("does not set the flag when every admin send fails (self-heal / retry on next trigger)", async () => {
    affiliateById.set("aff-1", makeAffiliate());
    availableSumByAffiliateId.set("aff-1", 750);
    adminUsers = [{ email: "bad1@test.com" }, { email: "bad2@test.com" }];
    sendAdminAffiliatePayoutReadyEmail.mockRejectedValue(new Error("smtp down"));

    await notifyAdminsIfPayoutEligible("aff-1");

    expect(affiliateUpdates.some(u => u.id === "aff-1")).toBe(false);
  });

  it("does not set the flag when there are zero admin users", async () => {
    affiliateById.set("aff-1", makeAffiliate());
    availableSumByAffiliateId.set("aff-1", 750);
    adminUsers = [];

    await notifyAdminsIfPayoutEligible("aff-1");

    expect(affiliateUpdates.some(u => u.id === "aff-1")).toBe(false);
  });

  it("passes the requested trigger through to the email", async () => {
    affiliateById.set("aff-1", makeAffiliate());
    availableSumByAffiliateId.set("aff-1", 750);
    adminUsers = [{ email: "admin@test.com" }];

    await notifyAdminsIfPayoutEligible("aff-1", "requested");

    expect(sendAdminAffiliatePayoutReadyEmail).toHaveBeenCalledWith(
      "admin@test.com",
      expect.objectContaining({ trigger: "requested" }),
    );
  });
});
