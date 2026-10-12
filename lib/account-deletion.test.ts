import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Every prisma call is recorded as "model.method" with its args, so the tests
// can assert exactly what each deletion path writes.
type Call = { model: string; method: string; args: unknown };
let calls: Call[] = [];
let purchaseCount = 0;
let userRow: Record<string, unknown> | null = null;
let voiceRows: { elevenLabsVoiceId: string }[] = [];
const transaction = vi.fn(async (ops: unknown[]) => ops);

const prismaMock = new Proxy({} as Record<string, unknown>, {
  get(_t, model: string) {
    if (model === "$transaction") return (...a: unknown[]) => (transaction as unknown as (...x: unknown[]) => unknown)(...a);
    return new Proxy({}, {
      get(_m, method: string) {
        return async (args: unknown) => {
          calls.push({ model, method, args });
          if (model === "user" && method === "findUnique") return userRow;
          if (model === "purchase" && method === "count") return purchaseCount;
          if (model === "clonedVoice" && method === "findMany") return voiceRows;
          return {};
        };
      },
    });
  },
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const invalidateAllSessions = vi.fn(async () => {});
vi.mock("@/lib/auth", () => ({ invalidateAllSessions: (...a: unknown[]) => (invalidateAllSessions as unknown as (...x: unknown[]) => unknown)(...a) }));
const deleteUnreferencedKeys = vi.fn(async () => 0);
vi.mock("@/lib/storage-cleanup", () => ({
  collectUserAssetKeys: vi.fn(async () => ["assets/a.mp4"]),
  collectProjectMediaKeys: vi.fn(async () => ["renders/p.mp4", "assets/a.mp4"]),
  deleteUnreferencedKeys: (...a: unknown[]) => (deleteUnreferencedKeys as unknown as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/source-url", () => ({ s3KeyFromStoredUrl: (u: string) => (u.includes("s3") ? "avatars/u1.png" : null) }));
vi.mock("@/lib/redis", () => ({ redis: { del: vi.fn(async () => {}) } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const deleteClonedVoice = vi.fn(async () => {});
vi.mock("@/utils/elevenlabs", () => ({ deleteClonedVoice: (...a: unknown[]) => (deleteClonedVoice as unknown as (...x: unknown[]) => unknown)(...a) }));

const cancelRazorpaySubscriptionBestEffort = vi.fn(async () => {});
vi.mock("@/lib/billing/cancel-on-account-lifecycle", () => ({
  cancelRazorpaySubscriptionBestEffort: (...a: unknown[]) =>
    (cancelRazorpaySubscriptionBestEffort as unknown as (...x: unknown[]) => unknown)(...a),
}));

const { hardDeleteUserAccount, PURGED_USER_MODELS, RETAINED_USER_MODELS } = await import("./account-deletion");

const delegate = (model: string) => model[0].toLowerCase() + model.slice(1);
const called = (model: string, method: string) => calls.filter((c) => c.model === model && c.method === method);

beforeEach(() => {
  calls = [];
  purchaseCount = 0;
  voiceRows = [];
  userRow = {
    email: "jane@example.com",
    avatarUrl: "https://bucket.s3.amazonaws.com/avatars/u1.png",
    razorpaySubscriptionId: "sub_1",
    deactivatedAt: null,
    purgedAt: null,
  };
  vi.clearAllMocks();
});

describe("hardDeleteUserAccount — no billing history", () => {
  it("cancels the Razorpay subscription, then deletes the User row", async () => {
    const result = await hardDeleteUserAccount("u1");
    expect(result).toEqual({ ok: true, mode: "deleted" });
    expect(cancelRazorpaySubscriptionBestEffort).toHaveBeenCalledWith("sub_1", "u1", "delete");
    expect(called("user", "delete")).toHaveLength(1);
    expect(called("user", "update")).toHaveLength(0);
  });

  it("still deletes the account when there is no subscription to cancel", async () => {
    userRow = { ...userRow, razorpaySubscriptionId: null };
    expect(await hardDeleteUserAccount("u1")).toEqual({ ok: true, mode: "deleted" });
    expect(cancelRazorpaySubscriptionBestEffort).not.toHaveBeenCalled();
  });

  it("removes stored media including a hosted avatar, and the delivery log by address", async () => {
    await hardDeleteUserAccount("u1");
    expect(deleteUnreferencedKeys).toHaveBeenCalledWith(["assets/a.mp4", "renders/p.mp4", "avatars/u1.png"], "account u1");
    expect(called("emailLog", "deleteMany")[0].args).toEqual({ where: { OR: [{ userId: "u1" }, { recipient: "jane@example.com" }] } });
  });
});

describe("hardDeleteUserAccount — billing history (anonymise path)", () => {
  beforeEach(() => {
    purchaseCount = 2;
    voiceRows = [{ elevenLabsVoiceId: "voice_1" }];
  });

  it("completes the deletion instead of refusing it", async () => {
    const result = await hardDeleteUserAccount("u1");
    expect(result).toEqual({ ok: true, mode: "anonymised" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("never deletes or modifies Purchase, Invoice or the User row itself", async () => {
    await hardDeleteUserAccount("u1");
    expect(called("user", "delete")).toHaveLength(0);
    for (const model of ["purchase", "invoice"]) {
      expect(calls.filter((c) => c.model === model && c.method !== "count")).toEqual([]);
    }
    // Commissions are another party's payout records.
    expect(calls.filter((c) => c.model === "commission")).toEqual([]);
  });

  it("deletes every other user-owned table", async () => {
    await hardDeleteUserAccount("u1");
    for (const model of PURGED_USER_MODELS) {
      expect(called(delegate(model), "deleteMany"), model).toEqual([
        { model: delegate(model), method: "deleteMany", args: { where: { userId: "u1" } } },
      ]);
    }
    expect(called("emailLog", "deleteMany")).toHaveLength(1);
  });

  it("anonymises the User row to a tombstone that can never sign in", async () => {
    await hardDeleteUserAccount("u1");
    const [update] = called("user", "update");
    const { where, data } = update.args as { where: unknown; data: Record<string, unknown> };
    expect(where).toEqual({ id: "u1" });
    expect(data).toMatchObject({
      email: "deleted-u1@deleted.clipiro.invalid",
      passwordHash: "",
      hasPassword: false,
      name: null,
      avatarUrl: null,
      pendingEmail: null,
      twoFactorEnabled: false,
      twoFactorSecretEnc: null,
      billingName: null,
      billingAddress: null,
      billingGstin: null,
      razorpaySubscriptionId: null,
      planId: null,
      credits: 0,
      minutes: 0,
      role: "USER",
      deactivationScheduledPurgeAt: null,
    });
    expect(data.purgedAt).toBeInstanceOf(Date);
    expect(data.deactivatedAt).toBeInstanceOf(Date);
  });

  it("keeps the original deactivation date when the user deactivated first", async () => {
    const deactivatedAt = new Date("2026-09-01T00:00:00Z");
    userRow = { ...userRow, deactivatedAt };
    await hardDeleteUserAccount("u1");
    expect((called("user", "update")[0].args as { data: Record<string, unknown> }).data.deactivatedAt).toBe(deactivatedAt);
  });

  it("keeps referral/affiliate rows but strips the IP and kills the affiliate code", async () => {
    await hardDeleteUserAccount("u1");
    expect(called("referral", "updateMany")[0].args).toEqual({ where: { referredUserId: "u1" }, data: { signupIp: null } });
    expect(called("affiliate", "updateMany")[0].args).toMatchObject({ where: { userId: "u1" }, data: { status: "suspended" } });
    expect(called("referral", "deleteMany")).toEqual([]);
    expect(called("affiliate", "deleteMany")).toEqual([]);
  });

  it("cleans up outside the database: sessions, storage, cloned voices, Razorpay", async () => {
    await hardDeleteUserAccount("u1");
    expect(cancelRazorpaySubscriptionBestEffort).toHaveBeenCalledWith("sub_1", "u1", "delete");
    expect(invalidateAllSessions).toHaveBeenCalledWith("u1");
    expect(deleteUnreferencedKeys).toHaveBeenCalledWith(["assets/a.mp4", "renders/p.mp4", "avatars/u1.png"], "account u1");
    expect(deleteClonedVoice).toHaveBeenCalledWith("voice_1");
  });

  it("is a no-op on an account that was already purged", async () => {
    userRow = { ...userRow, purgedAt: new Date() };
    expect(await hardDeleteUserAccount("u1")).toEqual({ ok: true, mode: "anonymised" });
    expect(transaction).not.toHaveBeenCalled();
    expect(cancelRazorpaySubscriptionBestEffort).not.toHaveBeenCalled();
  });

  it("reports a missing account rather than throwing", async () => {
    userRow = null;
    expect(await hardDeleteUserAccount("u1")).toEqual({ ok: false, reason: "Account not found." });
  });
});

describe("schema coverage", () => {
  it("classifies every model with a relation to User", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const related = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, name, body]) => name !== "User" && /^\s+\w+\s+User\??\s+@relation/m.test(body))
      .map(([, name]) => name)
      .sort();
    const classified = [...PURGED_USER_MODELS, ...RETAINED_USER_MODELS].sort();
    expect(classified).toEqual(related);
  });
});
