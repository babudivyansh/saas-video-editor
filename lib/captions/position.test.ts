import { describe, it, expect } from "vitest";
import { recommendCaptionPositionY, DEFAULT_CAPTION_POSITION_Y } from "./position";

const face = (tSec: number, y: number, h: number) => ({ tSec, y, h });

describe("recommendCaptionPositionY", () => {
  it("returns the plain default when there is no face data at all", () => {
    // No face timeline is the common case (screen recordings, detection
    // unavailable) and is not a failure.
    expect(recommendCaptionPositionY(null)).toBe(DEFAULT_CAPTION_POSITION_Y);
    expect(recommendCaptionPositionY([])).toBe(DEFAULT_CAPTION_POSITION_Y);
    expect(recommendCaptionPositionY(undefined)).toBe(DEFAULT_CAPTION_POSITION_Y);
  });

  it("leaves the default alone when the face sits high in frame", () => {
    // Face ends at 40% — the default 65% is already clear of it, so pushing
    // captions around would be change for its own sake.
    expect(recommendCaptionPositionY([face(1, 0.1, 0.3)])).toBe(DEFAULT_CAPTION_POSITION_Y);
  });

  it("pushes captions DOWN past a face that ends just below the default", () => {
    // Face bottom at 70% -> captions at 78%, still on screen.
    expect(recommendCaptionPositionY([face(1, 0.4, 0.3)])).toBe(78);
  });

  it("moves captions ABOVE a face that runs to the bottom of the frame", () => {
    // This is §14's example: face occupies the lower frame, so there is no room
    // beneath it and the captions belong above the face instead.
    const y = recommendCaptionPositionY([face(1, 0.55, 0.42)]);
    expect(y).toBeLessThan(DEFAULT_CAPTION_POSITION_Y);
    expect(y).toBe(47); // 55% top - 8% gap
  });

  it("uses the LOWEST face across the clip, not the average", () => {
    // Averaging would let captions overlap the speaker at exactly the moment
    // they lean into frame. Faces at 10-30% and 50-80%: the low one drives the
    // answer, pushing captions clear of 80% rather than of the ~45% average.
    const faces = [face(1, 0.1, 0.2), face(2, 0.55, 0.2), face(3, 0.1, 0.2)];
    expect(recommendCaptionPositionY(faces)).toBe(83);
  });

  it("gives up and returns the default when faces span the whole frame", () => {
    // Faces from 10% to 80% leave no clear band. Clamping to the top edge would
    // just trade overlapping the low face for overlapping the high one, so the
    // honest answer is the plain default rather than a confident wrong one.
    const faces = [face(1, 0.1, 0.2), face(2, 0.5, 0.3)];
    expect(recommendCaptionPositionY(faces)).toBe(DEFAULT_CAPTION_POSITION_Y);
  });

  it("only considers faces inside the clip's own window", () => {
    const faces = [face(1, 0.6, 0.35), face(50, 0.05, 0.1)];
    // Window excludes the low face, so the high one wins and we keep the default.
    expect(recommendCaptionPositionY(faces, { startSec: 40, endSec: 60 })).toBe(DEFAULT_CAPTION_POSITION_Y);
    // Window includes it, so the recommendation moves.
    expect(recommendCaptionPositionY(faces, { startSec: 0, endSec: 10 })).not.toBe(DEFAULT_CAPTION_POSITION_Y);
  });

  it("falls back to the default when the window contains no faces", () => {
    expect(recommendCaptionPositionY([face(1, 0.5, 0.3)], { startSec: 100, endSec: 110 }))
      .toBe(DEFAULT_CAPTION_POSITION_Y);
  });

  it("never returns a position that would sit off-frame", () => {
    for (const f of [face(1, 0.9, 0.5), face(1, 0, 1), face(1, 0.99, 0.01)]) {
      const y = recommendCaptionPositionY([f]);
      expect(y).toBeGreaterThanOrEqual(25);
      expect(y).toBeLessThanOrEqual(85);
    }
  });

  it("ignores non-finite boxes rather than producing NaN", () => {
    const y = recommendCaptionPositionY([{ tSec: 1, y: NaN, h: 0.3 }, face(2, 0.4, 0.3)]);
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBe(78);
  });
});
