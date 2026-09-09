import { describe, it, expect } from "vitest";
import { resolveCaptionCreateInput, CAPTIONS_OFF } from "./createPayload";

describe("resolveCaptionCreateInput", () => {
  it("prefers a valid template slug over the legacy index", () => {
    const r = resolveCaptionCreateInput({ captionTemplateId: "viral-beast", captionStyleIndex: 3 });
    expect(r.templateId).toBe("viral-beast");
    // The index is re-derived from the slug, not taken from the request — the
    // two must not disagree downstream.
    expect(r.captionStyleIndex).not.toBe(3);
  });

  it("honours the captions-off sentinel from either field, ahead of any style", () => {
    // Checked first so an explicit -1 is never reinterpreted as a style.
    expect(resolveCaptionCreateInput({ captionStyleIndex: -1 })).toEqual({
      captionStyleIndex: CAPTIONS_OFF, templateId: null,
    });
    expect(resolveCaptionCreateInput({ captionTemplateId: null, captionStyleIndex: 5 })).toEqual({
      captionStyleIndex: CAPTIONS_OFF, templateId: null,
    });
    // Even a valid slug loses to an explicit -1.
    expect(resolveCaptionCreateInput({ captionStyleIndex: -1, captionTemplateId: "hormozi" }).templateId)
      .toBeNull();
  });

  it("derives a template from the legacy index for existing v1 API clients", () => {
    // An API-key client that only knows about integers must keep working.
    expect(resolveCaptionCreateInput({ captionStyleIndex: 10 }).templateId).toBe("hormozi");
    expect(resolveCaptionCreateInput({ captionStyleIndex: 2 }).templateId).toBe("news");
  });

  it("rejects hostile index values instead of passing them through", () => {
    // This field was previously `body.captionStyleIndex ?? 0` on both routes —
    // no validation at all, on a public API surface.
    for (const bad of [9999, 1e9, -5, 1.5, "3", null, undefined, NaN, Infinity, {}, []]) {
      const r = resolveCaptionCreateInput({ captionStyleIndex: bad });
      expect(Number.isInteger(r.captionStyleIndex), `input ${String(bad)}`).toBe(true);
      expect(r.captionStyleIndex).toBeGreaterThanOrEqual(0);
      expect(r.captionStyleIndex).toBeLessThanOrEqual(15);
      expect(r.templateId, `input ${String(bad)}`).toBeTruthy();
    }
  });

  it("truncates a fractional index rather than producing a fractional one", () => {
    expect(resolveCaptionCreateInput({ captionStyleIndex: 3.9 }).captionStyleIndex).toBe(3);
  });

  it("ignores an unknown slug and falls back rather than trusting it", () => {
    // A slug that doesn't exist would resolve to no style at render time.
    const r = resolveCaptionCreateInput({ captionTemplateId: "not-a-real-template" });
    expect(r.templateId).toBe("clean");
  });

  it("falls back to the default when nothing usable is supplied", () => {
    const r = resolveCaptionCreateInput({});
    expect(r.templateId).toBe("clean");
    expect(r.captionStyleIndex).toBe(0);
  });
});
