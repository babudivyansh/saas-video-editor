// Timings the panel overlays follow, all in seconds of their own demo video.
// They describe the files scripts/build-hero-demo-media.sh cuts, so a change
// to a cut there must come with a change here.

/** Every timed demo loop is cut to exactly this length. */
export const DEMO_SECONDS = 10;

/** Captions panel: the spoken words of captions-wide.mp4 (from the video's own YouTube captions). */
export interface Word { w: string; s: number; e: number }
export { default as CAPTION_WORDS } from "./captionWords.json";

/**
 * Reframe panel: the two crops the gameplay layout takes from the 1920x1080
 * stream (reframe-before.mp4), as fractions of the frame: the gameplay window
 * (crop 864x856 at 528,0) and the facecam (crop 526x414 at 1390,666).
 */
export const REFRAME_BOXES = {
  game: { left: 528 / 1920, top: 0, width: 864 / 1920, height: 856 / 1080 },
  face: { left: 1390 / 1920, top: 666 / 1080, width: 526 / 1920, height: 414 / 1080 },
} as const;

/** B-roll panel: when the cutaway covers the main shot. */
export const BROLL_WINDOWS: { from: number; to: number }[] = [
  { from: 1.4, to: 4.4 },
  { from: 6.1, to: 7.4 },
];

/** Voice-over panel: the script, one line per few seconds of maldives footage. */
export const VOICE_LINES: { text: string; from: number; to: number }[] = [
  { text: "Twelve hundred islands, scattered across the Indian Ocean.", from: 0, to: 3.25 },
  { text: "Sandbars that appear and vanish with the tide.", from: 3.25, to: 6.7 },
  { text: "This is the Maldives, from above.", from: 6.7, to: 9.2 },
];
