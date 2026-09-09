// Recommending where captions should sit (§14).
//
// The failure this prevents is the most common way auto-captions look amateur:
// the caption block lands on top of the speaker's mouth and chin. Clipiro
// already knows where the face is — the pick job computes a face timeline for
// speaker-tracked reframing — so the same data can place the captions instead
// of everyone defaulting to "bottom" and hoping.
//
// This RECOMMENDS; it never decides. The value is written as the starting
// position on a new clip and the user can move it, because a face detector is
// occasionally wrong and a caption stuck in the wrong third of the frame with
// no visible way to move it would be worse than a plain default.
//
// Pure and dependency-free so it can be unit-tested without ffmpeg, S3 or a
// face model.

/** Fraction-of-frame face box, matching FaceBox in lib/reframe.ts. */
export interface FacePosition {
  tSec: number;
  y: number; // top, 0..1 of frame height
  h: number; // height, 0..1 of frame height
}

/** Percent of frame height. Matches captionPositionY on the wire. */
export const DEFAULT_CAPTION_POSITION_Y = 65;

/** Never recommend a position that would clip off-frame or sit under the UI. */
const MIN_Y = 25;
const MAX_Y = 85;
/** How much clear space below the face we aim for, in percent of frame. */
const GAP = 8;

/**
 * Picks a caption Y for a clip from the faces visible during it.
 *
 * Uses the LOWEST face bottom across the window rather than the average: the
 * captions have to stay clear of the speaker for the whole clip, and an average
 * would let them overlap during the exact moments the speaker leans into frame.
 *
 * Returns the plain default when there is no usable face data, which is the
 * common case (no face timeline, detection unavailable, a screen recording) and
 * is not a failure.
 */
export function recommendCaptionPositionY(
  faces: FacePosition[] | null | undefined,
  window?: { startSec: number; endSec: number },
): number {
  if (!Array.isArray(faces) || faces.length === 0) return DEFAULT_CAPTION_POSITION_Y;

  const inWindow = window
    ? faces.filter((f) => f.tSec >= window.startSec && f.tSec <= window.endSec)
    : faces;
  if (inWindow.length === 0) return DEFAULT_CAPTION_POSITION_Y;

  let lowestBottom = 0;
  for (const f of inWindow) {
    if (!Number.isFinite(f.y) || !Number.isFinite(f.h)) continue;
    lowestBottom = Math.max(lowestBottom, (f.y + f.h) * 100);
  }
  if (lowestBottom <= 0) return DEFAULT_CAPTION_POSITION_Y;

  // If the face already ends high in the frame, the default sits well below it
  // and there is nothing to fix — don't push captions up for no reason.
  const candidate = lowestBottom + GAP;
  if (candidate <= DEFAULT_CAPTION_POSITION_Y) return DEFAULT_CAPTION_POSITION_Y;

  // The face runs low. Captions can't go below it and stay on screen, so put
  // them ABOVE the face instead — this is the "face near the bottom, move the
  // captions up" case §14 describes.
  if (candidate > MAX_Y) {
    const tops = inWindow.map((f) => f.y * 100).filter(Number.isFinite);
    if (tops.length === 0) return DEFAULT_CAPTION_POSITION_Y;
    const above = Math.min(...tops) - GAP;
    // If going above the highest face would push the captions off the top of
    // the frame, faces span essentially the whole frame and there is no clear
    // band anywhere. Clamping to the top edge would just trade overlapping the
    // low face for overlapping the high one, so return the plain default and
    // let the user decide — a recommendation that can't be right shouldn't
    // pretend to be.
    return above < MIN_Y ? DEFAULT_CAPTION_POSITION_Y : clamp(above);
  }

  return clamp(candidate);
}

function clamp(y: number): number {
  return Math.round(Math.min(MAX_Y, Math.max(MIN_Y, y)));
}
