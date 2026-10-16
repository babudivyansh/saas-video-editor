// Keeps a caption's word timings in step with an edited caption text.
// Export uses `words` (not `text`) whenever word highlighting is on
// (lib/editor/caption-ass.ts), so an edit that only changed `text` — removing
// filler words, adding emojis — would silently not reach the video.
//
// Matching is greedy and in order: each word of the new text takes the timing
// of the next old word that reads the same (case and punctuation ignored).
// Old words with no match (the ones that were removed) are dropped. New words
// with no match (an emoji, an inserted word) are glued onto the word before
// them so they show at the same moment.

import type { CaptionWord } from "./types";

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

export function realignWords(words: CaptionWord[] | undefined, newText: string): CaptionWord[] | undefined {
  if (!words || words.length === 0) return words;
  const tokens = newText.split(/\s+/).filter(Boolean);
  const out: CaptionWord[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const key = norm(token);
    let found = -1;
    if (key) {
      for (let i = cursor; i < words.length; i++) {
        if (norm(words[i].word) === key) { found = i; break; }
      }
    }
    if (found >= 0) {
      out.push({ ...words[found], word: token });
      cursor = found + 1;
    } else if (out.length > 0) {
      out[out.length - 1] = { ...out[out.length - 1], word: `${out[out.length - 1].word} ${token}` };
    } else {
      // Leading token with nothing before it: show it with the first word we
      // still have, or at the start.
      const next = words[cursor];
      if (next) out.push({ ...next, word: token, endMs: next.startMs });
    }
  }
  return out.length > 0 ? out : undefined;
}
