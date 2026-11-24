import { describe, expect, it } from "vitest";
import { LAYOUT_TEMPLATES, SPEAKER_MODES, layoutTemplateFor, sanitizeFacecamBox, usesFacecam } from "./speaker-modes";

describe("sanitizeFacecamBox", () => {
  it("accepts a box inside the frame and rounds it", () => {
    expect(sanitizeFacecamBox({ x: 0.1234567, y: 0.2, w: 0.3, h: 0.25 })).toEqual({ x: 0.1235, y: 0.2, w: 0.3, h: 0.25 });
  });
  it("rejects anything that would put the crop outside the frame", () => {
    for (const bad of [null, "x", {}, { x: -0.1, y: 0, w: 0.3, h: 0.3 }, { x: 0.8, y: 0, w: 0.3, h: 0.3 },
      { x: 0, y: 0, w: 0.01, h: 0.3 }, { x: 0, y: 0, w: Number.NaN, h: 0.3 }, { x: "0", y: 0, w: 0.3, h: 0.3 }]) {
      expect(sanitizeFacecamBox(bad)).toBeNull();
    }
  });
});

describe("layout templates", () => {
  it("every kind of video offers two or three, all real modes", () => {
    for (const list of Object.values(LAYOUT_TEMPLATES)) {
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.length).toBeLessThanOrEqual(3);
      for (const t of list) expect(SPEAKER_MODES).toContain(t.mode);
    }
  });
  it("podcast, gaming and vlog each have a layout that works without face tracking", () => {
    for (const kind of ["podcast", "gaming", "vlog"] as const) {
      expect(LAYOUT_TEMPLATES[kind].some((t) => t.noTracking)).toBe(true);
    }
  });
  it("only the gaming layouts place a facecam", () => {
    expect(SPEAKER_MODES.filter(usesFacecam)).toEqual(["gaming", "gaming_pip"]);
    expect(layoutTemplateFor("fit").noTracking).toBe(true);
  });
});
