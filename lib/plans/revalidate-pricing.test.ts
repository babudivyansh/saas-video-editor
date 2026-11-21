import { describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const { revalidatePricing } = await import("./revalidate-pricing");

describe("revalidatePricing", () => {
  it("revalidates /pricing", () => {
    revalidatePricing();
    expect(revalidatePath).toHaveBeenCalledWith("/pricing");
  });

  it("swallows a revalidation error so the admin save still succeeds", () => {
    revalidatePath.mockImplementationOnce(() => {
      throw new Error("Invariant: static generation store missing");
    });
    expect(() => revalidatePricing()).not.toThrow();
  });
});
