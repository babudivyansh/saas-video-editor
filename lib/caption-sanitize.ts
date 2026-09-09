// Leaf module: no imports, no side effects.
//
// This lived in lib/autoclip-rerender.ts, which creates a render queue (and
// therefore a BullMQ Worker) at module scope. Anything that merely wanted to
// sanitize a caption word had to import that whole graph and start a worker as
// a side effect — which the caption-provider adapters and their tests must not
// do. Same reasoning that put NonRetryableError in lib/job-queue.ts rather
// than lib/render-queue.ts.
//
// lib/autoclip-rerender.ts re-exports this, so every existing import site is
// unchanged.

/**
 * Strips the characters that would be interpreted as ASS override syntax
 * (`{`, `}`, `\`) plus newlines, and bounds the length.
 *
 * Every user-editable caption word ends up inside an ASS subtitle file, where
 * `{\p1}` switches libass into vector-drawing mode — so an unsanitized word can
 * corrupt or blank the whole caption track.
 */
export function sanitizeCaptionWord(word: string): string {
  return word.replace(/[{}\\]/g, "").replace(/[\r\n]+/g, " ").slice(0, 120);
}
