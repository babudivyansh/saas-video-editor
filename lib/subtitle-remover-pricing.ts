// The Subtitle remover's price (leaf module, so the route that charges it and
// the app that quotes it — via @clipiro/shared, pinned by
// lib/mobile-create-schema.test.ts — use the same numbers).
//
// Three modes, priced by video length:
//   bottom — OCR (fal Florence-2) finds the captions, ffmpeg patches them.
//            1 credit per 10 s, 2–20. fal's per-call OCR cost is still not
//            confirmed (the account was locked during implementation), so the
//            tool stays Pro-gated; see lib/tool-costs.ts.
//   region — the user marks the boxes; no AI, only our own ffmpeg encode.
//            1 credit per minute, 1–10.
//   auto   — PiAPI remove-subtitle erases text anywhere and fills the
//            background: $0.006 per source second (piapi.ai, 2026-11-14).
//            1 credit per 4 s = 0.25 cr/s x $0.0784 net floor = $0.0196/s, ~3.3x.

export type SubtitleRemoverMode = "bottom" | "region" | "auto";

export const SUBTITLE_REMOVER_MODES: readonly SubtitleRemoverMode[] = ["bottom", "region", "auto"];

/** Longest video any mode accepts (PiAPI's own limit is also 600 s). */
export const SUBTITLE_REMOVER_MAX_SEC = 10 * 60;

export function subtitleRemoverCredits(durationSec: number, mode: SubtitleRemoverMode = "bottom"): number {
  switch (mode) {
    case "region":
      return Math.max(1, Math.min(10, Math.ceil(durationSec / 60)));
    case "auto":
      return Math.max(2, Math.ceil(durationSec / 4));
    default:
      return Math.max(2, Math.min(20, Math.ceil(durationSec / 10)));
  }
}

/** Cheapest and dearest a single run can cost, for the pricing page. */
export const SUBTITLE_REMOVER_CREDIT_RANGE = {
  min: subtitleRemoverCredits(1, "region"),
  max: subtitleRemoverCredits(SUBTITLE_REMOVER_MAX_SEC, "auto"),
} as const;
