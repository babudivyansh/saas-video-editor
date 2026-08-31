// Shared "AI Tools" text operations for the editor — Stage 8 of the
// 2026-08-30 audit remediation. Client-safe (no server-only imports), used by
// both the UI panels and, for the LLM-shaped operations, the API route below.
//
// Not every "AI Tools" button is actually AI: three of the eight advertised
// operations turn out to be deterministic string transforms that don't need
// a model call at all, so they're free, instant, and live entirely here —
// only the genuinely generative ones cost a credit and hit Gemini
// (app/api/editor/ai-text/route.ts).

import { planEmoji } from "@/lib/caption-templates";

// LLM-shaped: transform meaning/wording, need a model. One credit each.
export const AI_TEXT_LLM_OPERATIONS = ["rewrite", "grammar", "readability", "shorten", "expand", "viral", "translate"] as const;
export type AiTextLlmOperation = (typeof AI_TEXT_LLM_OPERATIONS)[number];

// Deterministic: pure string transforms, free, no network call.
export const AI_TEXT_FREE_OPERATIONS = ["emojis", "lineBreaks", "fillerWords"] as const;
export type AiTextFreeOperation = (typeof AI_TEXT_FREE_OPERATIONS)[number];

export type AiTextOperation = AiTextLlmOperation | AiTextFreeOperation;

export function isLlmOperation(op: AiTextOperation): op is AiTextLlmOperation {
  return (AI_TEXT_LLM_OPERATIONS as readonly string[]).includes(op);
}

// ── Free operation 1: emoji placement ───────────────────────────────────────
//
// Reuses the exact curated map + rate limiting AutoClip's caption pipeline
// already ships (lib/caption-templates.ts's planEmoji) rather than a second,
// divergent copy — tokenizes on whitespace, which is the same unit planEmoji
// already expects.
export function addEmojisToText(text: string): string {
  const tokens = text.split(/(\s+)/); // keep whitespace runs so spacing round-trips exactly
  const wordTokenIndices = tokens.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0);
  const words = wordTokenIndices.map((i) => ({ word: tokens[i] }));
  const placements = planEmoji(words, true);
  for (const [wordIdx, emoji] of Object.entries(placements)) {
    const tokenIdx = wordTokenIndices[Number(wordIdx)];
    tokens[tokenIdx] = `${tokens[tokenIdx]} ${emoji}`;
  }
  return tokens.join("");
}

// ── Free operation 2: auto line breaks ──────────────────────────────────────
//
// Greedy word-wrap at a target line length, same "don't hyphenate, break on
// whitespace" behavior as CSS/terminal wrapping — no model needed for
// something this mechanical. Existing newlines are treated as hard breaks the
// wrap respects rather than collapses.
const DEFAULT_WRAP_WIDTH = 32; // ~2 lines of a 9:16 caption at typical caption font sizes

export function autoLineBreaks(text: string, width = DEFAULT_WRAP_WIDTH): string {
  return text
    .split("\n")
    .map((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length === 0) return "";
      const out: string[] = [];
      let current = words[0];
      for (const word of words.slice(1)) {
        if (current.length + 1 + word.length <= width) current += ` ${word}`;
        else { out.push(current); current = word; }
      }
      out.push(current);
      return out.join("\n");
    })
    .join("\n");
}

// ── Free operation 3: remove filler words ───────────────────────────────────
//
// A fixed list rather than an LLM call — filler-word removal is unambiguous
// pattern matching, not a judgment call worth paying for. Whole-word only
// (word boundaries), case-insensitive, multi-word phrases first so "you know"
// doesn't leave a stray "know".
const FILLER_PHRASES = [
  "you know", "i mean", "sort of", "kind of", "i guess", "at the end of the day",
  "um", "uh", "uhh", "umm", "like", "basically", "actually", "literally", "honestly", "actually,",
];

export function removeFillerWords(text: string): string {
  let result = text;
  for (const phrase of FILLER_PHRASES.sort((a, b) => b.length - a.length)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b,?`, "gi"), "");
  }
  return result.replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

// ── LLM operations: prompt templates ────────────────────────────────────────
//
// Server-only code (the actual Gemini call) lives in the API route, not here
// — this file must stay importable from client components. Prompts live here
// anyway so the route and any future caller share the exact same wording.
export function buildAiTextPrompt(operation: AiTextLlmOperation, text: string, targetLang?: string): string {
  const base = "Return ONLY the resulting text. No prose, no explanation, no markdown fences, no quotes around it.";
  switch (operation) {
    case "rewrite":
      return `Rewrite the following video caption/text to be clearer and punchier, keeping the same meaning and roughly the same length. ${base}\n\nText:\n${text}`;
    case "grammar":
      return `Fix any grammar, spelling, and punctuation errors in the following text. Keep the wording and meaning otherwise unchanged. ${base}\n\nText:\n${text}`;
    case "readability":
      return `Rewrite the following text to be easier to read at a glance — shorter sentences, simpler words, same meaning. ${base}\n\nText:\n${text}`;
    case "shorten":
      return `Shorten the following text to about half its length while keeping the core meaning. ${base}\n\nText:\n${text}`;
    case "expand":
      return `Expand the following text with a bit more detail or context, roughly double the length, keeping the same tone. ${base}\n\nText:\n${text}`;
    case "viral":
      return `Rewrite the following text in a punchy, high-energy short-form-video style (the kind that hooks a viewer in the first second) — same core meaning. ${base}\n\nText:\n${text}`;
    case "translate":
      return `Translate the following text into ${targetLang || "Spanish"}. Keep proper nouns and numbers unchanged. ${base}\n\nText:\n${text}`;
  }
}
