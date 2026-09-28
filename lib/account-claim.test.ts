import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "random-hash") } }));

const deleteMany = vi.fn((args: unknown) => ({ op: "deleteMany", args }));
const update = vi.fn((args: unknown) => ({ op: "update", args }));
const $transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock("@/lib/prisma", () => ({
  prisma: { twoFactorRecoveryCode: { deleteMany }, user: { update }, $transaction },
}));

const invalidateAllSessions = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({ invalidateAllSessions }));

const { claimUnverifiedAccount } = await import("./account-claim");

beforeEach(() => vi.clearAllMocks());

describe("claimUnverifiedAccount", () => {
  it("drops every credential a squatter could have planted, in one transaction", async () => {
    await claimUnverifiedAccount("u1");
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        emailVerifiedAt: expect.any(Date),
        passwordHash: "random-hash",
        hasPassword: false,
        twoFactorEnabled: false,
        twoFactorSecretEnc: null,
        twoFactorLastUsedStep: null,
      },
    });
    expect(invalidateAllSessions).toHaveBeenCalledWith("u1");
  });

  it("keeps a password the verifying flow just set itself", async () => {
    await claimUnverifiedAccount("u1", { passwordHash: "new-hash" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ passwordHash: "new-hash", hasPassword: true, twoFactorEnabled: false }),
    }));
  });
});
