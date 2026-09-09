import { describe, it, expect, vi } from "vitest";

// pricing.ts reads one Config row at module scope' worth of import depth, so
// prisma has to be mocked before the import — same pattern as the credits and
// autoclip-dub suites.
vi.mock("@/lib/prisma", () => ({ prisma: { config: { findUnique: vi.fn(async () => null) } } }));

const {
  billableMinutes,
  estimateCaptionRenderCredits,
  buildIdempotencyKey,
  captionRenderRefId,
  hookRevisionOf,
  toMicroUsd,
  CAPTION_RENDER_PRICING_DEFAULTS,
} = await import("./pricing");

describe("billableMinutes", () => {
  it("rounds a partial minute UP to a whole billable one", () => {
    // This is the entire unit-economics story: a 12s clip costs the same as a
    // 59s one, which is why AutoClip must not send every candidate.
    expect(billableMinutes(12)).toBe(1);
    expect(billableMinutes(59)).toBe(1);
    expect(billableMinutes(60)).toBe(1);
    expect(billableMinutes(61)).toBe(2);
    expect(billableMinutes(180)).toBe(3);
  });

  it("never returns less than one, even for nonsense input", () => {
    expect(billableMinutes(0)).toBe(1);
    expect(billableMinutes(-5)).toBe(1);
    expect(billableMinutes(NaN)).toBe(1);
    expect(billableMinutes(Infinity)).toBe(1);
  });
});

describe("estimateCaptionRenderCredits", () => {
  it("scales with billable minutes, not clip seconds", () => {
    const p = CAPTION_RENDER_PRICING_DEFAULTS;
    expect(estimateCaptionRenderCredits(30, p)).toBe(p.perBillableMinute);
    expect(estimateCaptionRenderCredits(61, p)).toBe(p.perBillableMinute * 2);
  });

  it("adds the flat per-render component when configured", () => {
    expect(estimateCaptionRenderCredits(30, { perBillableMinute: 5, perRender: 3 })).toBe(8);
  });
});

describe("captionRenderRefId", () => {
  it("is deterministic so a worker can reconstruct it to refund", () => {
    // A Date.now() in here is exactly how a failed job silently never gets
    // refunded — the worker runs outside the request and has no other handle.
    expect(captionRenderRefId("clip_1", 0)).toBe("caption-render:clip_1:0");
    expect(captionRenderRefId("clip_1", 0)).toBe(captionRenderRefId("clip_1", 0));
    expect(captionRenderRefId("clip_1", 1)).not.toBe(captionRenderRefId("clip_1", 0));
  });
});

describe("buildIdempotencyKey", () => {
  const base = { clipId: "clip_1", captionRevision: 0, templateId: "viral-bold-01", language: "en" };

  it("is stable for identical inputs — the double-click guard", () => {
    expect(buildIdempotencyKey(base)).toBe(buildIdempotencyKey(base));
  });

  it("treats an omitted position and an explicit null as the same render", () => {
    expect(buildIdempotencyKey(base)).toBe(
      buildIdempotencyKey({ ...base, positionX: null, positionY: null }),
    );
  });

  it("changes when any input that affects the output changes", () => {
    const key = buildIdempotencyKey(base);
    expect(buildIdempotencyKey({ ...base, captionRevision: 1 })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, templateId: "viral-beast" })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, language: "hi" })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, positionX: 50, positionY: 65 })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, hookRevision: "abc" })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, exportFps: 60 })).not.toBe(key);
  });

  it("does not collide across clips", () => {
    expect(buildIdempotencyKey({ ...base, clipId: "clip_2" })).not.toBe(buildIdempotencyKey(base));
  });

  it("does not collide when a field value contains the delimiter", () => {
    // Regression: the first implementation joined on "|", so a caller-supplied
    // templateId of "a|b" with language "c" hashed identically to templateId
    // "a" with language "b|c" — two different renders sharing one key, where
    // the second would be handed the first one's output.
    expect(
      buildIdempotencyKey({ ...base, templateId: "a|b", language: "c" }),
    ).not.toBe(
      buildIdempotencyKey({ ...base, templateId: "a", language: "b|c" }),
    );
  });
});

describe("hookRevisionOf", () => {
  it("is null when there is no hook to render", () => {
    expect(hookRevisionOf(null)).toBeNull();
    expect(hookRevisionOf({ enabled: false, text: "hi" })).toBeNull();
    expect(hookRevisionOf({ enabled: true, text: "" })).toBeNull();
  });

  it("changes with the text, so editing the hook permits a new render", () => {
    const a = hookRevisionOf({ enabled: true, text: "You won't believe this" });
    const b = hookRevisionOf({ enabled: true, text: "You WILL believe this" });
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });
});

describe("toMicroUsd", () => {
  it("converts to integer minor units, matching the schema's money convention", () => {
    expect(toMicroUsd(0.25)).toBe(250_000);
    expect(toMicroUsd(1)).toBe(1_000_000);
    expect(toMicroUsd(null)).toBeNull();
    expect(toMicroUsd(undefined)).toBeNull();
    expect(toMicroUsd(NaN)).toBeNull();
  });
});
