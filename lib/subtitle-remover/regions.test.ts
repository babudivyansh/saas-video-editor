import { describe, it, expect } from "vitest";
import {
  parseOcrRegions, clampToFrame, captionBands, parseUserRegions, userRegionsToPatches, buildDelogoFilter,
  pngSize, sampleFpsFor, MAX_BANDS, SAMPLE_FRAME_CAP, type Detection,
} from "./regions";

const HD = { w: 1920, h: 1080 };

describe("parseOcrRegions", () => {
  it("reads Florence-2 quad_boxes and drops anything malformed", () => {
    expect(parseOcrRegions({ results: { quad_boxes: [
      { x: 10, y: 900, w: 300, h: 40, label: "hi" },
      { x: "1", y: 2, w: 3, h: 4 },
      { x: 1, y: 2, w: 0, h: 4 },
      null,
    ] } })).toEqual([{ x: 10, y: 900, w: 300, h: 40 }]);
  });
  it("never throws on junk", () => {
    expect(parseOcrRegions(null)).toEqual([]);
    expect(parseOcrRegions({ results: {} })).toEqual([]);
    expect(parseOcrRegions("x")).toEqual([]);
  });
});

describe("clampToFrame", () => {
  // delogo fails the whole encode on a box touching x=0 or the right/bottom edge.
  it("keeps every box one pixel clear of all four edges", () => {
    expect(clampToFrame({ x: 0, y: 1000, w: 1920, h: 80 }, HD)).toEqual({ x: 1, y: 1000, w: 1918, h: 79 });
    expect(clampToFrame({ x: -50, y: -10, w: 100, h: 60 }, HD)).toEqual({ x: 1, y: 1, w: 49, h: 49 });
  });
  it("drops boxes with nothing left inside the frame", () => {
    expect(clampToFrame({ x: 1950, y: 10, w: 40, h: 40 }, HD)).toBeNull();
    expect(clampToFrame({ x: 10, y: 10, w: 2, h: 40 }, HD)).toBeNull();
  });
});

describe("sampleFpsFor", () => {
  it("samples 2 fps for short videos and caps long ones", () => {
    expect(sampleFpsFor(30)).toBe(2);
    expect(sampleFpsFor(600) * 600).toBeCloseTo(SAMPLE_FRAME_CAP);
  });
});

describe("captionBands", () => {
  const line = (t: number, x: number, w: number, y = 950): Detection => ({ x, y, w, h: 50, t });

  it("joins lines of different widths at the same height into one band", () => {
    // Old IoU grouping made a cluster per line here and kept only 8.
    const dets = Array.from({ length: 40 }, (_, i) => line(i * 0.5, 400 + (i % 3) * 200, 1100 - (i % 3) * 400));
    const bands = captionBands(dets, HD, 0.5);
    expect(bands).toHaveLength(1);
    expect(bands[0].x).toBeLessThanOrEqual(400);
    expect(bands[0].x + bands[0].w).toBeGreaterThanOrEqual(1500);
    expect(bands[0].startSec).toBe(0);
    expect(bands[0].endSec).toBeGreaterThan(19.5);
  });

  it("bridges the gap between sparse samples on a long video", () => {
    const bands = captionBands([line(0, 500, 900), line(4, 500, 900), line(8, 500, 900)], HD, 4);
    expect(bands).toHaveLength(1);
    expect(bands[0].startSec).toBe(0);
    expect(bands[0].endSec).toBe(11);
  });

  it("ignores text above the bottom area", () => {
    expect(captionBands([line(0, 100, 400, 100)], HD, 1)).toEqual([]);
  });

  it("keeps a second line at a different height as its own band", () => {
    const bands = captionBands([line(0, 500, 900, 880), line(0, 500, 900, 980), line(1, 500, 900, 880), line(1, 500, 900, 980)], HD, 1);
    expect(bands.length).toBeGreaterThanOrEqual(1);
    for (const b of bands) {
      expect(b.x).toBeGreaterThanOrEqual(1);
      expect(b.y + b.h).toBeLessThanOrEqual(HD.h - 1);
    }
  });

  it("merges into one band instead of dropping any when there are too many", () => {
    // Bands far apart in time so none join: more than MAX_BANDS of them.
    const dets = Array.from({ length: MAX_BANDS + 5 }, (_, i) => line(i * 100, 500, 900));
    const bands = captionBands(dets, HD, 1);
    expect(bands).toHaveLength(1);
    expect(bands[0].startSec).toBe(0);
    expect(bands[0].endSec).toBeGreaterThan((MAX_BANDS + 4) * 100);
  });

  it("never produces a box delogo would reject, even for text at the very edge", () => {
    const bands = captionBands([line(0, 0, 1920, 1040)], HD, 1);
    expect(bands).toHaveLength(1);
    const b = bands[0];
    expect(b.x).toBeGreaterThanOrEqual(1);
    expect(b.y).toBeGreaterThanOrEqual(1);
    expect(b.x + b.w).toBeLessThanOrEqual(HD.w - 1);
    expect(b.y + b.h).toBeLessThanOrEqual(HD.h - 1);
  });
});

describe("parseUserRegions", () => {
  it("accepts 1-4 boxes as fractions, from JSON text", () => {
    expect(parseUserRegions(JSON.stringify([{ x: 0.1, y: 0.4, w: 0.8, h: 0.1 }]))).toEqual([{ x: 0.1, y: 0.4, w: 0.8, h: 0.1 }]);
  });
  it("refuses anything malformed", () => {
    expect(parseUserRegions(null)).toBeNull();
    expect(parseUserRegions("not json")).toBeNull();
    expect(parseUserRegions("[]")).toBeNull();
    expect(parseUserRegions(JSON.stringify(Array(5).fill({ x: 0, y: 0, w: 0.1, h: 0.1 })))).toBeNull();
    expect(parseUserRegions(JSON.stringify([{ x: 0.5, y: 0.5, w: 0.6, h: 0.1 }]))).toBeNull();
    expect(parseUserRegions(JSON.stringify([{ x: 0.1, y: 0.1, w: 0.001, h: 0.1 }]))).toBeNull();
    expect(parseUserRegions(JSON.stringify([{ x: "0.1", y: 0.1, w: 0.2, h: 0.1 }]))).toBeNull();
  });
});

describe("userRegionsToPatches + buildDelogoFilter", () => {
  it("converts to pixels inside the frame, for the whole video", () => {
    const patches = userRegionsToPatches([{ x: 0, y: 0.9, w: 1, h: 0.1 }], HD);
    expect(patches).toEqual([{ x: 1, y: 972, w: 1918, h: 107 }]);
    expect(buildDelogoFilter(patches)).toBe("delogo=x=1:y=972:w=1918:h=107:show=0");
  });
  it("time-limits detected bands", () => {
    expect(buildDelogoFilter([{ x: 5, y: 900, w: 100, h: 40, startSec: 1, endSec: 2.5 }]))
      .toBe("delogo=x=5:y=900:w=100:h=40:show=0:enable='between(t,1.00,2.50)'");
    expect(buildDelogoFilter([])).toBeNull();
  });
});

describe("pngSize", () => {
  it("reads IHDR width and height", () => {
    const buf = new Uint8Array(24);
    buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(buf.buffer);
    view.setUint32(16, 1080);
    view.setUint32(20, 1920);
    expect(pngSize(buf)).toEqual({ w: 1080, h: 1920 });
    expect(pngSize(new Uint8Array(30))).toBeNull();
  });
});
