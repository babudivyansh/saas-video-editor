import { beforeEach, describe, expect, it, vi } from "vitest";

// chargeCredits' idempotency fast path used to return { ok: true } for ANY
// existing Generation with the given key — without checking who owned it and
// without saying that nothing had been charged. Every paid tool route then
// started a fresh job, so replaying a key ran the tool for free; a failing
// replay refunded the ORIGINAL charge; and replaying another user's key
// reached refundCredits' legacy branch and granted purchased credits from
// nothing (all three reproduced on localhost, 2026-10-14 tools audit).

interface Gen { id: string; userId: string }
let gensByKey: Map<string, Gen>;
let gensById: Map<string, Gen>;

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));
vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled: true })) }));
vi.mock("@/lib/credit-events", () => ({ firePostCreditSpendEmails: vi.fn(), fireZeroCreditsEmail: vi.fn() }));

const prismaMock = {
  generation: {
    findUnique: vi.fn(async ({ where }: { where: { idempotencyKey?: string; id?: string } }) =>
      (where.idempotencyKey ? gensByKey.get(where.idempotencyKey) : gensById.get(where.id ?? "")) ?? null),
    create: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  user: {
    findUnique: vi.fn(async () => ({ bonusCredits: 0, subscriptionCredits: 0, purchasedCredits: 7, credits: 7 })),
    update: vi.fn(async () => ({})),
  },
  creditTransaction: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []), create: vi.fn(async () => ({})) },
  $queryRaw: vi.fn(async () => []),
  $executeRaw: vi.fn(async () => 0),
  $transaction: vi.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prismaMock)),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { chargeCredits, refundCredits } = await import("./credits");

beforeEach(() => {
  vi.clearAllMocks();
  const g = { id: "gen-a", userId: "user-a" };
  gensByKey = new Map([["key-1", g]]);
  gensById = new Map([["gen-a", g]]);
});

describe("chargeCredits — idempotency key", () => {
  it("flags a same-user replay and charges nothing", async () => {
    const res = await chargeCredits({ userId: "user-a", amount: 3, toolSlug: "cut-and-crop", idempotencyKey: "key-1" });
    expect(res).toEqual({ ok: true, balance: 7, generationId: "gen-a", replay: true });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.generation.create).not.toHaveBeenCalled();
  });

  it("refuses another user's key instead of treating it as already paid", async () => {
    const res = await chargeCredits({ userId: "user-b", amount: 3, toolSlug: "cut-and-crop", idempotencyKey: "key-1" });
    expect(res).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("refundCredits — ownership", () => {
  it("never refunds or grants against another user's generation", async () => {
    await refundCredits({ userId: "user-b", amount: 3, generationId: "gen-a" });
    expect(prismaMock.creditTransaction.count).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.generation.update).not.toHaveBeenCalled();
  });

  it("still refunds the owner", async () => {
    await refundCredits({ userId: "user-a", amount: 3, generationId: "gen-a" });
    expect(prismaMock.creditTransaction.count).toHaveBeenCalled();
  });
});
