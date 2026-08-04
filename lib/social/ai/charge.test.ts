import { beforeEach, describe, expect, it, vi } from "vitest";

// HttpError lives in ../api, which pulls in auth → redis → env at module scope.
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "t", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incrWithExpire: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const chargeCredits = vi.fn();
const refundCredits = vi.fn(async () => {});
const markGenerationStatus = vi.fn(async () => {});
vi.mock("@/lib/credits", () => ({ chargeCredits, refundCredits, markGenerationStatus }));

let toolConfig = { enabled: true, creditCost: 3 };
vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => toolConfig) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { runCharged } = await import("./charge");
const { HttpError } = await import("../api");

const OPTS = { userId: "u1", toolSlug: "social-caption", idempotencyKey: "k1", description: "d" };

beforeEach(() => {
  toolConfig = { enabled: true, creditCost: 3 };
  chargeCredits.mockReset().mockResolvedValue({ ok: true, generationId: "g1" });
  refundCredits.mockClear();
  markGenerationStatus.mockClear();
});

describe("runCharged", () => {
  it("charges, runs, and marks the generation completed", async () => {
    await expect(runCharged(OPTS, async () => "result")).resolves.toBe("result");
    expect(chargeCredits.mock.calls[0][0]).toMatchObject({ amount: 3, idempotencyKey: "k1" });
    expect(markGenerationStatus).toHaveBeenCalledWith("g1", "completed");
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("refunds and reports 502 when the work throws", async () => {
    const err = await runCharged(OPTS, async () => {
      throw new Error("gemini exploded");
    }).catch((e: unknown) => e);

    expect(refundCredits).toHaveBeenCalledWith({ userId: "u1", amount: 3, generationId: "g1" });
    expect(err).toBeInstanceOf(HttpError);
    expect((err as InstanceType<typeof HttpError>).status).toBe(502);
    // The user must be able to tell a failed generation from a silent charge.
    expect((err as Error).message).toContain("not charged");
  });

  it("does not run the work at all when the charge fails", async () => {
    chargeCredits.mockResolvedValue({ ok: false, reason: "insufficient_credits" });
    const work = vi.fn();
    const err = await runCharged(OPTS, work).catch((e: unknown) => e);
    expect(work).not.toHaveBeenCalled();
    expect((err as InstanceType<typeof HttpError>).status).toBe(402);
    expect((err as InstanceType<typeof HttpError>).code).toBe("insufficient_credits");
  });

  it("503s a disabled tool without touching credits", async () => {
    toolConfig = { enabled: false, creditCost: 3 };
    const err = await runCharged(OPTS, async () => "x").catch((e: unknown) => e);
    expect(chargeCredits).not.toHaveBeenCalled();
    expect((err as InstanceType<typeof HttpError>).status).toBe(503);
  });

  it("still logs a generation for a zero-cost tool, so usage stays auditable", async () => {
    toolConfig = { enabled: true, creditCost: 0 };
    await runCharged({ ...OPTS, toolSlug: "social-kpi-explain" }, async () => "x");
    expect(chargeCredits).toHaveBeenCalledTimes(1);
    expect(chargeCredits.mock.calls[0][0].amount).toBe(0);
  });
});
