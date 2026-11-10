// Expand's target shapes and canvas maths. No server imports: the workspace
// offers exactly these ratios, and the server grows the canvas with the same
// function.

export const EXPAND_RATIOS = ["1:1", "9:16", "16:9", "4:5", "3:4", "4:3"] as const;
export type ExpandRatio = (typeof EXPAND_RATIOS)[number];

/** Canvas size for an image grown to a ratio: it only ever grows, never crops. */
export function expandedSize(width: number, height: number, ratio: ExpandRatio): { width: number; height: number } {
  const [rw, rh] = ratio.split(":").map(Number);
  const target = rw / rh;
  const current = width / height;
  if (Math.abs(current - target) < 0.01) return { width, height };
  return current < target
    ? { width: Math.round(height * target), height }
    : { width, height: Math.round(width / target) };
}
