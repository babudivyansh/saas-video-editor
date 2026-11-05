import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The shared cancel handler: a job that is already saving its result can't be
// cancelled (that refunded a result the user still got), and a cancel tells
// the provider to stop (fal used to run, and bill, cancelled requests).

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
const refundCredits = vi.fn();
vi.mock("@/lib/credits", () => ({ refundCredits: (...a: unknown[]) => refundCredits(...a), cancelGeneration: vi.fn(), markGenerationStatus: vi.fn() }));

const { createJobCancelHandler } = await import("./job-routes");
type J = Parameters<typeof createJobCancelHandler>[0] extends Map<string, infer T> ? T : never;

function job(over: Partial<J> = {}): J {
  return { progress: 40, status: "processing", outputPath: "/tmp/x", downloadName: "x.png", userId: "u1", creditCost: 1, refunded: false, generationId: "g1", ...over } as J;
}
const del = (id: string) => new NextRequest(`http://localhost/api/tools/x?jobId=${id}`, { method: "DELETE" });

beforeEach(() => { refundCredits.mockReset(); });

describe("createJobCancelHandler", () => {
  it("cancels, refunds and stops the provider", async () => {
    const onCancel = vi.fn(async () => {});
    const j = job({ onCancel });
    const res = await createJobCancelHandler(new Map([["a", j]]))(del("a"));
    expect(res.status).toBe(200);
    expect(j.status).toBe("cancelled");
    expect(refundCredits).toHaveBeenCalledOnce();
    await new Promise((r) => setTimeout(r, 0));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("refuses once the job is saving its result, and refunds nothing", async () => {
    const onCancel = vi.fn();
    const j = job({ finalizing: true, onCancel });
    const res = await createJobCancelHandler(new Map([["a", j]]))(del("a"));
    expect(res.status).toBe(409);
    expect(j.status).toBe("processing");
    expect(j.refunded).toBe(false);
    expect(refundCredits).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("still cancels when the provider stop fails", async () => {
    const j = job({ onCancel: () => { throw new Error("fal down"); } });
    const res = await createJobCancelHandler(new Map([["a", j]]))(del("a"));
    expect(res.status).toBe(200);
    expect(j.status).toBe("cancelled");
  });
});
