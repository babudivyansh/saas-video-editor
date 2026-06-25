// Structured edit operations the AI co-editor can plan and the client can apply.
// Keeping the schema small + explicit means Gemini returns reliable JSON and the
// client reducer can validate every step before touching the document.

import type { TrackAspect, EffectId } from "@/lib/track-editor-types";

export type EditorOp =
  | { op: "setAspect"; aspect: TrackAspect }
  | { op: "setSpeed"; factor: number }
  | { op: "removeFillers" }
  | { op: "removeSilences"; minGapSec?: number }
  | { op: "addCaptions" }
  | { op: "addText"; text: string }
  | { op: "applyEffect"; effect: EffectId };

const ASPECTS: TrackAspect[] = ["9:16", "16:9", "1:1", "4:5"];
const EFFECTS: EffectId[] = [
  "cinematic", "vhs", "glitch", "blur", "rgb-split", "film-grain", "retro", "neon",
  "viral-zoom", "punch-in", "face-focus", "dynamic-crop", "zoom", "pan", "shake",
];

// Validate + coerce raw JSON from the model into a safe op list.
export function parseOps(raw: unknown): EditorOp[] {
  if (!Array.isArray(raw)) return [];
  const out: EditorOp[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    switch (o.op) {
      case "setAspect":
        if (ASPECTS.includes(o.aspect as TrackAspect)) out.push({ op: "setAspect", aspect: o.aspect as TrackAspect });
        break;
      case "setSpeed": {
        const f = Number(o.factor);
        if (f >= 0.25 && f <= 4) out.push({ op: "setSpeed", factor: f });
        break;
      }
      case "removeFillers":
        out.push({ op: "removeFillers" });
        break;
      case "removeSilences":
        out.push({ op: "removeSilences", minGapSec: typeof o.minGapSec === "number" ? o.minGapSec : undefined });
        break;
      case "addCaptions":
        out.push({ op: "addCaptions" });
        break;
      case "addText":
        if (typeof o.text === "string" && o.text.trim()) out.push({ op: "addText", text: o.text.trim().slice(0, 120) });
        break;
      case "applyEffect":
        if (EFFECTS.includes(o.effect as EffectId)) out.push({ op: "applyEffect", effect: o.effect as EffectId });
        break;
    }
  }
  return out;
}

export function describeOp(op: EditorOp): string {
  switch (op.op) {
    case "setAspect": return `Set aspect ratio to ${op.aspect}`;
    case "setSpeed": return `Set clip speed to ${op.factor}×`;
    case "removeFillers": return "Remove filler words (um, uh, like…)";
    case "removeSilences": return "Cut out long silences";
    case "addCaptions": return "Generate animated captions";
    case "addText": return `Add text: “${op.text}”`;
    case "applyEffect": return `Apply ${op.effect} effect`;
  }
}

// The system instruction handed to Gemini.
export const OP_SYSTEM_PROMPT = `You are an agentic video-editing co-pilot. Convert the user's request into a concrete plan of edit operations the editor can execute.

Return STRICT JSON only (no markdown), shaped exactly:
{ "summary": "one short sentence describing what you'll do", "steps": [ <ops> ] }

Allowed ops (use only these):
- { "op": "setAspect", "aspect": "9:16" | "16:9" | "1:1" | "4:5" }
- { "op": "setSpeed", "factor": <0.25..4> }
- { "op": "removeFillers" }
- { "op": "removeSilences", "minGapSec": <optional number, default 0.7> }
- { "op": "addCaptions" }
- { "op": "addText", "text": "<short on-screen text>" }
- { "op": "applyEffect", "effect": "cinematic"|"vhs"|"glitch"|"blur"|"rgb-split"|"film-grain"|"retro"|"neon"|"viral-zoom"|"punch-in"|"face-focus"|"dynamic-crop"|"zoom"|"pan"|"shake" }

Rules: pick the minimal set of steps that satisfy the request. If the request can't map to any op, return an empty steps array and explain in summary. Never invent ops or fields.`;
