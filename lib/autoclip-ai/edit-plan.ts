// Stage 1 — the AI edit plan.
//
// Gemini reads one clip's numbered transcript and says WHAT should happen on
// screen: punch in on this word, go wide on that one, cut to B-roll for this
// phrase, prefer this layout. The renderer already knows HOW to do every one
// of those (lib/camera-motion.ts, lib/broll.ts, lib/reframe.ts); this only
// decides when.
//
// Anchors are WORD INDEXES, never seconds. A model is good at "the word
// 'million'" and bad at "14.37s", and an index survives silence and filler
// removal: the renderer resolves it against the same word list it trims,
// which is what keeps the edits on their words after a re-render.

import { z } from "zod";
import type { WordTiming } from "@/utils/elevenlabs";
import { geminiJson } from "@/lib/autoclip-ai/gemini";

// ── What the model returns ──────────────────────────────────────────────────

const wordIdx = z.number().int().min(0);
const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("punch_in"),
    word: wordIdx,
    strength: z.enum(["low", "medium", "high"]).catch("medium"),
    holdSec: z.number().min(0.5).max(6).catch(2),
  }),
  z.object({ type: z.literal("reset_wide"), word: wordIdx }),
  z.object({
    type: z.literal("broll"),
    fromWord: wordIdx,
    toWord: wordIdx,
    queries: z.array(z.string().min(2).max(80)).min(1).max(3),
    reaction: z.boolean().catch(false),
  }),
  z.object({
    type: z.literal("layout"),
    fromWord: wordIdx,
    toWord: wordIdx,
    layout: z.enum(["single", "split", "cuts", "wide"]),
  }),
]);

export const editPlanResponseSchema = z.object({
  // Unknown action types are dropped one by one rather than failing the plan.
  actions: z.array(z.unknown()).max(40).transform((xs) =>
    xs.flatMap((x) => {
      const r = actionSchema.safeParse(x);
      return r.success ? [r.data] : [];
    }),
  ),
});
export type EditAction = z.infer<typeof actionSchema>;

// ── What the renderer consumes ──────────────────────────────────────────────

export type PlanLayout = "single" | "split" | "cuts" | "wide";

/** Times are clip-relative seconds on the ORIGINAL (untrimmed) clip timeline. */
export interface ResolvedEditPlan {
  v: 1;
  zooms: { tSec: number; strength: number; holdSec: number }[];
  resets: number[];
  broll: { startSec: number; endSec: number; queries: string[]; sentence: string; reaction: boolean }[];
  /**
   * The layout the plan prefers for the clip as a whole. The renderer draws one
   * layout per clip (a split and a single crop are different filtergraphs), so a
   * per-range answer collapses to whichever layout covers most of the clip —
   * and only when it covers at least LAYOUT_MAJORITY of it.
   */
  layout: PlanLayout | null;
}

const STRENGTH: Record<"low" | "medium" | "high", number> = { low: 0.35, medium: 0.65, high: 1 };

/** Editorial limits. Breaking any of these looks worse than not editing. */
export const PLAN_LIMITS = {
  leadInSec: 0.8,
  leadOutSec: 0.5,
  minZoomSpacingSec: 3,
  maxBroll: 3,
  brollMinSec: 1.5,
  brollMaxSec: 4,
  /** No B-roll over the hook. */
  brollNotBeforeSec: 2,
  /** ...nor over the payoff (fraction of the clip kept clear at the end). */
  brollEndMarginFrac: 0.1,
  brollMinSpacingSec: 6,
  layoutMinSec: 2,
} as const;
const LAYOUT_MAJORITY = 0.6;

export const EMPTY_EDIT_PLAN: ResolvedEditPlan = { v: 1, zooms: [], resets: [], broll: [], layout: null };

/**
 * Turn the model's word-anchored actions into times, and enforce the limits:
 * nothing over the first/last moments, punch-ins spaced out, B-roll clear of
 * the hook and payoff and never back-to-back, a reset only after a punch-in.
 * Pure, so every rule is unit-tested.
 */
export function resolveEditPlan(actions: EditAction[], words: WordTiming[], clipDurationSec: number): ResolvedEditPlan {
  const n = words.length;
  if (n === 0 || clipDurationSec <= 0) return { ...EMPTY_EDIT_PLAN };
  const at = (i: number) => words[Math.min(n - 1, i)];
  const L = PLAN_LIMITS;
  const inBody = (t: number) => t >= L.leadInSec && t <= clipDurationSec - L.leadOutSec;

  // Punch-ins, in time order, spaced out.
  const zooms: ResolvedEditPlan["zooms"] = [];
  const zoomCandidates = actions
    .filter((a): a is Extract<EditAction, { type: "punch_in" }> => a.type === "punch_in" && a.word < n)
    // Land just before the word: the spring takes a beat to arrive, and a
    // push that peaks AFTER the word reads late.
    .map((a) => ({ tSec: Math.max(0, at(a.word).start / 1000 - 0.15), strength: STRENGTH[a.strength], holdSec: a.holdSec }))
    .sort((a, b) => a.tSec - b.tSec);
  for (const z of zoomCandidates) {
    if (!inBody(z.tSec)) continue;
    const prev = zooms[zooms.length - 1];
    if (prev && z.tSec - prev.tSec < L.minZoomSpacingSec) continue;
    zooms.push({ ...z, holdSec: Math.min(z.holdSec, clipDurationSec - L.leadOutSec - z.tSec) });
  }

  // Resets only make sense while zoomed in; each ends the punch-in before it.
  const resets: number[] = [];
  for (const a of actions) {
    if (a.type !== "reset_wide" || a.word >= n) continue;
    const t = at(a.word).start / 1000;
    if (!inBody(t)) continue;
    const owner = [...zooms].reverse().find((z) => z.tSec < t);
    if (!owner || t > owner.tSec + owner.holdSec) continue;
    owner.holdSec = Math.max(0.5, t - owner.tSec);
    resets.push(t);
  }

  // B-roll windows.
  const broll: ResolvedEditPlan["broll"] = [];
  const brollCandidates = actions
    .filter((a): a is Extract<EditAction, { type: "broll" }> => a.type === "broll" && a.fromWord < n)
    .map((a) => {
      const from = Math.min(a.fromWord, a.toWord), to = Math.min(n - 1, Math.max(a.fromWord, a.toWord));
      // Cut away just after the trigger word, the same rule planBrollWindows
      // follows — cutting ON the word hides the moment the viewer recognises it.
      const start = at(from).end / 1000 + 0.15;
      const end = Math.min(start + L.brollMaxSec, Math.max(start + L.brollMinSec, at(to).end / 1000));
      const sentence = words.slice(Math.max(0, from - 6), Math.min(n, to + 7)).map((w) => w.word).join(" ");
      return { startSec: start, endSec: end, queries: a.queries.map((q) => q.trim().slice(0, 80)), sentence, reaction: a.reaction };
    })
    .sort((a, b) => a.startSec - b.startSec);
  for (const b of brollCandidates) {
    if (broll.length >= L.maxBroll) break;
    if (b.startSec < L.brollNotBeforeSec) continue;
    if (b.endSec > clipDurationSec * (1 - L.brollEndMarginFrac)) continue;
    const prev = broll[broll.length - 1];
    if (prev && b.startSec - prev.startSec < L.brollMinSpacingSec) continue;
    broll.push(b);
  }

  // Layout: the majority answer, or nothing.
  const cover = new Map<PlanLayout, number>();
  for (const a of actions) {
    if (a.type !== "layout" || a.fromWord >= n) continue;
    const s = at(Math.min(a.fromWord, a.toWord)).start / 1000;
    const e = at(Math.max(a.fromWord, a.toWord)).end / 1000;
    if (e - s < L.layoutMinSec) continue;
    cover.set(a.layout, (cover.get(a.layout) ?? 0) + (e - s));
  }
  let layout: PlanLayout | null = null;
  for (const [k, secs] of cover) {
    if (secs >= clipDurationSec * LAYOUT_MAJORITY && (!layout || secs > (cover.get(layout) ?? 0))) layout = k;
  }

  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    v: 1,
    zooms: zooms.map((z) => ({ tSec: r3(z.tSec), strength: z.strength, holdSec: r3(z.holdSec) })),
    resets: resets.map(r3),
    broll: broll.map((b) => ({ ...b, startSec: r3(b.startSec), endSec: r3(b.endSec) })),
    layout,
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────────

/** "[3.4s] (12)So (13)the (14)thing…" — indexed words, one line per phrase. */
export function formatIndexedTranscript(words: WordTiming[], perLine = 14): string {
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    const chunk = words.slice(i, i + perLine);
    lines.push(`[${(chunk[0].start / 1000).toFixed(1)}s] ` + chunk.map((w, j) => `(${i + j})${w.word}`).join(" "));
  }
  return lines.join("\n");
}

export function buildEditPlanPrompt(args: {
  words: WordTiming[];
  clipDurationSec: number;
  title: string;
  aspect: string;
  instructions?: string;
}): string {
  return `You are the editor of a short-form vertical video (${args.aspect}, ${args.clipDurationSec.toFixed(1)}s) titled "${args.title}".
Below is its transcript. Each word has its index in parentheses.

Plan the edit. Return JSON: {"actions":[...]} using ONLY these action types:
- {"type":"punch_in","word":<index>,"strength":"low"|"medium"|"high","holdSec":<0.5-6>} — push the camera in as this word is said. Use on the key claim, number, punchline or emotional peak. At most one every few seconds; 2-5 in a typical 30-60s clip.
- {"type":"reset_wide","word":<index>} — return to the normal framing (only after a punch_in, e.g. when the topic turns).
- {"type":"broll","fromWord":<index>,"toWord":<index>,"queries":["<visual stock-footage search>", ...],"reaction":false} — cut away to footage illustrating what is being said, for that phrase. Queries must describe a concrete SHOT ("close-up of hands counting cash", not "money"). 1-3 queries. Set "reaction": true only for a meme-style reaction moment (disbelief, facepalm, celebration). Never during the first two seconds (the hook) or the last moments (the payoff). At most 3.
- {"type":"layout","fromWord":<index>,"toWord":<index>,"layout":"single"|"split"|"cuts"|"wide"} — only when the content clearly needs it: "split" when two people react to each other throughout, "cuts" for back-and-forth dialogue, "wide" when several people matter at once.

Fewer, better edits beat many. An empty list is a valid answer for a clip that should simply play.
${args.instructions?.trim() ? `\nThe creator asked: ${args.instructions.trim().slice(0, 500)}\n` : ""}
Transcript:
${formatIndexedTranscript(args.words)}`;
}

/** Ask Gemini for the plan and resolve it. Null when the call fails (render as today). */
export async function generateEditPlan(args: {
  words: WordTiming[];
  clipDurationSec: number;
  title: string;
  aspect: string;
  instructions?: string;
}): Promise<ResolvedEditPlan | null> {
  if (args.words.length < 4) return null;
  const answer = await geminiJson({
    label: "edit-plan",
    parts: [buildEditPlanPrompt(args)],
    schema: editPlanResponseSchema,
    timeoutMs: 25_000,
  });
  if (!answer) return null;
  return resolveEditPlan(answer.actions, args.words, args.clipDurationSec);
}
