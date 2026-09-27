import { describe, expect, it, vi } from "vitest";

// schemas.ts imports render-queue only for its queue-name list; the real module
// pulls in Redis and the strict env parse, neither of which a shape rule needs.
vi.mock("@/lib/render-queue", () => ({ KNOWN_RENDER_QUEUE_NAMES: ["auto-clip-pick"] }));
const { validatePlanShape } = await import("./schemas");

// Clip Minutes (2026-09-26): /admin/pricing can create and edit minute packs
// and a subscription's monthly minutes, and the same cross-field guard that
// stops a tier-less subscription stops a minute pack that would grant nothing.
describe("validatePlanShape — Clip Minutes", () => {
  it("accepts a minute pack that grants minutes and no credits", () => {
    expect(validatePlanShape({ kind: "minute_pack", credits: 0, minutes: 300 })).toBeNull();
  });

  it("rejects a minute pack with no minutes", () => {
    expect(validatePlanShape({ kind: "minute_pack", credits: 0, minutes: 0 })).toMatch(/needs a number of minutes/);
  });

  it("rejects credits on a minute pack — fulfilment would never grant them", () => {
    expect(validatePlanShape({ kind: "minute_pack", credits: 50, minutes: 300 })).toMatch(/set credits to 0/);
  });

  it("rejects one-time minutes on a credit pack", () => {
    expect(validatePlanShape({ kind: "pack", credits: 100, minutes: 100 })).toMatch(/Only Clip Minutes packs/);
  });

  it("rejects a monthly minutes allowance on a one-time pack", () => {
    expect(validatePlanShape({ kind: "pack", credits: 100, monthlyMinutes: 150 })).toMatch(/Only subscription plans/);
  });

  it("still accepts a subscription with monthly minutes", () => {
    expect(validatePlanShape({
      kind: "subscription", tier: "pro", intervalMonths: 1, monthlyCredits: 160, credits: 160, monthlyMinutes: 400,
    })).toBeNull();
  });
});
