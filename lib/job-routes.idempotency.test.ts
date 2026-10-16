import { describe, expect, it, vi } from "vitest";

// idempotencyResponse decides what a job route answers when chargeCredits did
// not make a fresh charge. The rule that matters: a replay never starts a new
// job (it would be unpaid, and a failing one would refund the first job).

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/credits", () => ({ refundCredits: vi.fn(), cancelGeneration: vi.fn(), markGenerationStatus: vi.fn() }));

const { idempotencyResponse } = await import("./job-routes");

const jobs = new Map([
  ["job-1", { generationId: "gen-1" }],
  ["job-2", { generationId: "gen-2" }],
]);

describe("idempotencyResponse", () => {
  it("lets a fresh charge through", () => {
    expect(idempotencyResponse({ ok: true, balance: 5, generationId: "gen-9" }, jobs)).toBeNull();
  });

  it("lets ordinary charge failures through to the route's own handling", () => {
    expect(idempotencyResponse({ ok: false, reason: "insufficient_credits", balance: 0 }, jobs)).toBeNull();
    expect(idempotencyResponse({ ok: false, reason: "tool_disabled" }, jobs)).toBeNull();
  });

  it("hands a replay the job its key already started", async () => {
    const res = idempotencyResponse({ ok: true, balance: 5, generationId: "gen-2", replay: true }, jobs);
    expect(res?.status).toBe(202);
    expect(await res?.json()).toEqual({ jobId: "job-2", generationId: "gen-2", replayed: true });
  });

  it("409s a replay whose job is gone instead of starting a new one", async () => {
    const res = idempotencyResponse({ ok: true, balance: 5, generationId: "gen-gone", replay: true }, jobs);
    expect(res?.status).toBe(409);
    expect((await res?.json()).generationId).toBe("gen-gone");
  });

  it("409s a key owned by another user", () => {
    expect(idempotencyResponse({ ok: false, reason: "idempotency_conflict" }, jobs)?.status).toBe(409);
  });
});
