import { beforeEach, describe, expect, it, vi } from "vitest";

let review: { id: string } | null;
let promptState: {
  permanentlyDismissedAt: Date | null;
  promptCount: number;
  lastPromptedAt: Date | null;
} | null;
let clipCount: number;
let generationCount: number;
const promptStateUpsert = vi.fn(async () => ({}));
const promptEventCreate = vi.fn(async () => ({}));
const promptEventUpdateMany = vi.fn(async () => ({}));
const emailSequenceUpsert = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: { findUnique: vi.fn(async () => review) },
    reviewPromptState: {
      findUnique: vi.fn(async () => promptState),
      upsert: (...args: unknown[]) => promptStateUpsert(...args),
    },
    reviewPromptEvent: {
      create: (...args: unknown[]) => promptEventCreate(...args),
      updateMany: (...args: unknown[]) => promptEventUpdateMany(...args),
    },
    reviewEmailSequence: {
      upsert: (...args: unknown[]) => emailSequenceUpsert(...args),
    },
    clip: { count: vi.fn(async () => clipCount) },
    generation: { count: vi.fn(async () => generationCount) },
  },
}));

const getReviewSettings = vi.fn();
vi.mock("@/lib/reviews/settings", () => ({
  getReviewSettings: (...args: unknown[]) => getReviewSettings(...args),
}));

const { evaluatePromptTrigger, recordPrompt, recordDismiss } = await import("./prompt-triggers");

beforeEach(() => {
  vi.clearAllMocks();
  review = null;
  promptState = null;
  clipCount = 0;
  generationCount = 0;
  getReviewSettings.mockResolvedValue({ promptThrottleDays: 21, promptMaxLifetime: 3 });
});

describe("evaluatePromptTrigger", () => {
  it("never prompts a user who already has a review", async () => {
    review = { id: "rev-1" };
    const result = await evaluatePromptTrigger("u1", "export_complete");
    expect(result).toEqual({ shouldPrompt: false });
  });

  it("does not prompt a permanently-dismissed user", async () => {
    promptState = { permanentlyDismissedAt: new Date(), promptCount: 0, lastPromptedAt: null };
    const result = await evaluatePromptTrigger("u1", "export_complete");
    expect(result.shouldPrompt).toBe(false);
  });

  it("does not prompt once the lifetime cap is reached", async () => {
    promptState = { permanentlyDismissedAt: null, promptCount: 3, lastPromptedAt: null };
    const result = await evaluatePromptTrigger("u1", "export_complete");
    expect(result.shouldPrompt).toBe(false);
  });

  it("does not prompt within the cooldown window", async () => {
    promptState = { permanentlyDismissedAt: null, promptCount: 1, lastPromptedAt: new Date() };
    const result = await evaluatePromptTrigger("u1", "export_complete");
    expect(result.shouldPrompt).toBe(false);
  });

  it("prompts again once the cooldown window has passed", async () => {
    promptState = {
      permanentlyDismissedAt: null,
      promptCount: 1,
      lastPromptedAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000),
    };
    const result = await evaluatePromptTrigger("u1", "export_complete");
    expect(result).toEqual({ shouldPrompt: true, trigger: "export_complete" });
  });

  it("always qualifies export_complete (trusts the caller)", async () => {
    const result = await evaluatePromptTrigger("u1", "export_complete");
    expect(result).toEqual({ shouldPrompt: true, trigger: "export_complete" });
  });

  it("always qualifies billing_success (trusts the caller)", async () => {
    const result = await evaluatePromptTrigger("u1", "billing_success");
    expect(result).toEqual({ shouldPrompt: true, trigger: "billing_success" });
  });

  it("requires the autoclips milestone threshold to be crossed", async () => {
    clipCount = 2;
    expect((await evaluatePromptTrigger("u1", "autoclips_milestone")).shouldPrompt).toBe(false);
    clipCount = 5;
    expect((await evaluatePromptTrigger("u1", "autoclips_milestone")).shouldPrompt).toBe(true);
  });

  it("requires the tool-generation milestone threshold to be crossed", async () => {
    generationCount = 3;
    expect((await evaluatePromptTrigger("u1", "tool_generation_complete")).shouldPrompt).toBe(false);
    generationCount = 10;
    expect((await evaluatePromptTrigger("u1", "tool_generation_complete")).shouldPrompt).toBe(true);
  });

  it("trusts days_active (the cron already applied its own filters)", async () => {
    const result = await evaluatePromptTrigger("u1", "days_active");
    expect(result).toEqual({ shouldPrompt: true, trigger: "days_active" });
  });
});

describe("recordPrompt", () => {
  it("upserts lastPromptedAt, increments promptCount, and stores the trigger", async () => {
    await recordPrompt("u1", "export_complete");
    expect(promptStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        create: expect.objectContaining({ userId: "u1", promptCount: 1, lastTrigger: "export_complete" }),
        update: expect.objectContaining({ promptCount: { increment: 1 }, lastTrigger: "export_complete" }),
      }),
    );
  });

  it("creates a ReviewPromptEvent with the trigger and featureHint", async () => {
    await recordPrompt("u1", "tool_generation_complete", "ai_tools");
    expect(promptEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", trigger: "tool_generation_complete", featureHint: "ai_tools" }),
      }),
    );
  });

  it("starts a ReviewEmailSequence for a non-days_active trigger", async () => {
    await recordPrompt("u1", "export_complete");
    expect(emailSequenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        create: expect.objectContaining({ userId: "u1", sourceTrigger: "export_complete" }),
      }),
    );
  });

  it("does not start a ReviewEmailSequence for days_active (the cron already sends its own nudge)", async () => {
    await recordPrompt("u1", "days_active");
    expect(emailSequenceUpsert).not.toHaveBeenCalled();
  });
});

describe("recordDismiss", () => {
  it("increments dismissCount without setting permanentlyDismissedAt for a soft dismiss", async () => {
    await recordDismiss("u1", false);
    const call = promptStateUpsert.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(call.create.permanentlyDismissedAt).toBeUndefined();
  });

  it("sets permanentlyDismissedAt for a permanent dismiss", async () => {
    await recordDismiss("u1", true);
    const call = promptStateUpsert.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(call.create.permanentlyDismissedAt).toBeInstanceOf(Date);
  });

  it("closes the still-open ReviewPromptEvent", async () => {
    await recordDismiss("u1", true);
    expect(promptEventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", dismissedAt: null, convertedAt: null },
        data: expect.objectContaining({ permanentDismiss: true }),
      }),
    );
  });
});
