// The Subtitle remover's price (leaf module, so the route that charges it and
// the app that quotes it — via @clipiro/shared, pinned by
// lib/mobile-create-schema.test.ts — use the same numbers).
//
// Credits scale with video duration (a rough proxy for how many OCR calls a
// job makes, since sampling is capped/evenly-spaced across the duration) —
// TODO verify-before-ship: this app's fal.ai account had an exhausted
// balance during implementation, so the exact per-call cost of
// fal-ai/florence-2-large/ocr could not be confirmed live. Revisit this
// once real pricing is confirmable; this is a conservative placeholder, not
// a measured cost.
export function subtitleRemoverCredits(durationSec: number): number {
  return Math.max(2, Math.min(20, Math.ceil(durationSec / 10)));
}
