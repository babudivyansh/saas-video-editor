// Shared aspect-ratio math for the editors' client preview (CSS masking) and the
// server-side ffmpeg renderer (crop+scale filter). One source of truth so the
// live preview matches the exported video.

export type Aspect = "original" | "9:16" | "1:1" | "16:9";

export interface Mask { top: number; bottom: number; left: number; right: number }

// Percentage insets to overlay on a source video so the visible region matches
// the chosen aspect (used by the client preview to letter/pillar-box the crop).
export function computeMask(w: number, h: number, crop: Aspect): Mask {
  const none = { top: 0, bottom: 0, left: 0, right: 0 };
  if (crop === "original" || w <= 0 || h <= 0) return none;

  if (crop === "9:16") {
    const keepW = h * 9 / 16;
    if (keepW >= w) return none;
    const pct = (w - keepW) / 2 / w * 100;
    return { top: 0, bottom: 0, left: pct, right: pct };
  }
  if (crop === "1:1") {
    if (w >= h) {
      const pct = (w - h) / 2 / w * 100;
      return { top: 0, bottom: 0, left: pct, right: pct };
    }
    const pct = (h - w) / 2 / h * 100;
    return { top: pct, bottom: pct, left: 0, right: 0 };
  }
  if (crop === "16:9") {
    const keepH = w * 9 / 16;
    if (keepH >= h) return none;
    const pct = (h - keepH) / 2 / h * 100;
    return { top: pct, bottom: pct, left: 0, right: 0 };
  }
  return none;
}

// Target output resolution for each aspect. "original" returns null (no scale).
export function outputResolution(aspect: Aspect): { w: number; h: number } | null {
  switch (aspect) {
    case "9:16": return { w: 1080, h: 1920 };
    case "1:1":  return { w: 1080, h: 1080 };
    case "16:9": return { w: 1920, h: 1080 };
    default:     return null;
  }
}

/**
 * ffmpeg `crop` for the largest centred window of the given aspect that fits
 * inside the frame, whatever the frame's own shape. Width and height are both
 * clamped to the input and rounded down to even numbers (libx264).
 *
 * The AutoClip renderer used to hard-code one side per aspect
 * ("crop=in_w:in_w*9/16" for 16:9), which only fits a frame that is at most
 * 16:9 wide. A 20:9 phone recording (2400x1080) asked for a 2400x1350 crop
 * and ffmpeg refused the whole graph (CLIPIRO-WEB-14); the 9:16 and 1:1
 * variants break the same way on sources taller than 9:16.
 */
export function centeredAspectCrop(aspect: "9:16" | "16:9" | "1:1"): string {
  const [rw, rh] = aspect === "16:9" ? [16, 9] : aspect === "1:1" ? [1, 1] : [9, 16];
  const w = `trunc(min(iw\\,ih*${rw}/${rh})/2)*2`;
  const h = `trunc(min(ih\\,iw*${rh}/${rw})/2)*2`;
  return `crop=${w}:${h}`;
}

// ffmpeg video filter chain that crops the source to the chosen aspect (centered)
// and scales it to the standard output resolution. Returns "" for "original"
// (only forces even dimensions, required by libx264).
export function cropScaleFilter(aspect: Aspect): string {
  const res = outputResolution(aspect);
  if (!res) return "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const r = res.w / res.h; // width/height ratio
  // Largest centered rect with ratio r, then scale to the target resolution.
  return `crop='min(iw,ih*${r})':'min(ih,iw/${r})',scale=${res.w}:${res.h}`;
}
