import type { TierId } from "@/lib/plans/tiers";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { VIDEO_MODELS } from "@/lib/models/videoModels";

export interface ToolCost {
  /** Flat credits per generation — most of the non-registry tools. For
   *  durational tools (ai-creator) this is a representative price at
   *  defaultDurationSeconds, used only for display (tool-costs/admin UI);
   *  actual billing uses creditsPerSecond. */
  creditCost: number;
  /** Set only for durational (video-like) tools. Real billing multiplies this
   *  by the clamped requested duration, same as lib/models/videoModels.ts. */
  creditsPerSecond?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  defaultDurationSeconds?: number;
  /** Real provider $ cost — null where no reliable figure exists yet. */
  costUsd: number | null;
  costBasis: string;
  generationType: "image" | "video" | "audio" | "utility";
  /** Omit = open to everyone (incl. free). Set on ai-creator plus tools whose
   * provider cost is unverified (subtitle-remover, face-swap). */
  requiredTier?: TierId;
}

// Source of truth for every AI tool's credit cost EXCEPT image-generator and
// video-generator, which read per-model costs from lib/models/imageModels.ts
// / videoModels.ts instead (they have multiple swappable providers; these
// tools each have exactly one). lib/tool-config.ts's TOOL_DEFAULTS re-exports
// creditCost from here so there's a single source of truth for the number —
// previously TOOL_DEFAULTS hardcoded its own copy, disconnected from the
// cost-rationale comments already living in each route.
export const TOOL_COSTS: Record<string, ToolCost> = {
  "audio-balancer":   { creditCost: 0, costUsd: 0, costBasis: "FFmpeg (local compute only)", generationType: "utility" },
  "mp3-converter":    { creditCost: 0, costUsd: 0, costBasis: "FFmpeg (local compute only)", generationType: "utility" },
  "video-compressor": { creditCost: 0, costUsd: 0, costBasis: "FFmpeg (local compute only)", generationType: "utility" },
  "enhance-prompt":   { creditCost: 0, costUsd: 0, costBasis: "Google Gemini text, negligible cost", generationType: "utility" },
  "brainstormer":     { creditCost: 1, costUsd: null, costBasis: "Google Gemini text, near-zero real cost", generationType: "utility" },
  "social-insights":  { creditCost: 2, costUsd: null, costBasis: "Google Gemini text over computed social metrics, near-zero real cost", generationType: "utility" },
  // Social Tracker v2 AI layer. All of these send a ≤2 kB factsheet of numbers
  // the deterministic engine already computed and get back a few hundred tokens
  // of prose — genuinely sub-cent per call, same basis as brainstormer above.
  // Prices are relative effort, not cost recovery: the exec report fans out over
  // a whole period and several accounts, kpi-explain is a tooltip and is free
  // (and cached 24h on rounded values, so an idle dashboard never re-bills).
  "social-exec-report":   { creditCost: 5, costUsd: null, costBasis: "Google Gemini text over a computed multi-account period factsheet, near-zero real cost", generationType: "utility" },
  "social-content-recs":  { creditCost: 3, costUsd: null, costBasis: "Google Gemini text over computed post scores, near-zero real cost", generationType: "utility" },
  "social-caption":       { creditCost: 1, costUsd: null, costBasis: "Google Gemini text, near-zero real cost", generationType: "utility" },
  "social-post-narration": { creditCost: 1, costUsd: null, costBasis: "Google Gemini text, batched 10 posts per call, near-zero real cost", generationType: "utility" },
  "social-kpi-explain":   { creditCost: 0, costUsd: null, costBasis: "Google Gemini text, cached 24h on rounded metric values, near-zero real cost", generationType: "utility" },
  "cut-and-crop":     { creditCost: 1, costUsd: 0, costBasis: "FFmpeg (local compute only)", generationType: "utility" },
  // Duration-scaled (2-20 credits — see creditCostForDuration in the route)
  // since Phase 2 replaced the old fixed-band blur with real per-frame OCR
  // detection (fal-ai/florence-2-large/ocr-with-region) — no longer FFmpeg-only.
  // TODO verify-before-ship: real per-call OCR cost couldn't be confirmed
  // live (fal.ai account balance was exhausted during implementation); this
  // display value and the route's cost formula are both placeholders.
  // Gated pro+ until the real OCR cost is confirmed: pro-tier credit revenue
  // (~₹15.7/cr) gives enough margin buffer for an unknown per-frame cost.
  "subtitle-remover": { creditCost: 4, costUsd: null, costBasis: "fal-ai/florence-2-large OCR per sampled frame + FFmpeg render, cost not yet confirmed", generationType: "video", requiredTier: "pro" },
  "voiceover":        { creditCost: 2, costUsd: 0.10, costBasis: "$0.05/1,000 chars (ElevenLabs Flash TTS), 2,000-char cap", generationType: "audio" },
  "vocal-remover":    { creditCost: 3, costUsd: 0.21, costBasis: "$0.0007/s (fal.ai Demucs), 5-min worst case", generationType: "audio" },
  // Fixed in Phase 1: was 2cr flat (≈$0.20 revenue) against real cost that could
  // run $1-2/generation uncapped — a confirmed loss-making price. Now
  // duration-scaled and gated to Pro+, like the video-generator models.
  "ai-creator": {
    creditCost: 25, // display price at the 5s default (5cr/s * 5s)
    creditsPerSecond: 5, // ceil(0.14*3/0.0952)
    minDurationSeconds: 3,
    maxDurationSeconds: 15,
    defaultDurationSeconds: 5,
    costUsd: 0.14,
    costBasis: "$0.14/s (fal.ai SadTalker, 720p — no 1080p tier found)",
    generationType: "video",
    requiredTier: "pro",
  },
  "voice-changer":    { creditCost: 6, costUsd: 0.30, costBasis: "~$0.20/min (ElevenLabs STS), 90s cap", generationType: "audio" },
  "reddit-video":     { creditCost: 2, costUsd: null, costBasis: "ElevenLabs TTS + FFmpeg render", generationType: "video" },
  "text-video":       { creditCost: 2, costUsd: null, costBasis: "ElevenLabs TTS + FFmpeg render", generationType: "video" },
  "enhance-speech":   { creditCost: 6, costUsd: 0.30, costBasis: "~$0.20/min (ElevenLabs Isolation), 90s cap", generationType: "audio" },
  "youtube-downloader":   { creditCost: 1, costUsd: 0, costBasis: "yt-dlp, bandwidth only", generationType: "utility" },
  "instagram-downloader": { creditCost: 1, costUsd: 0, costBasis: "yt-dlp, bandwidth only", generationType: "utility" },
  "background-remover":   { creditCost: 1, costUsd: 0.018, costBasis: "$0.018/run (fal-ai/imageutils/rembg)", generationType: "image" },
  // Gated pro+ until a real per-run figure is confirmed (same rationale as
  // subtitle-remover above).
  "face-swap":            { creditCost: 2, costUsd: null, costBasis: "fal-ai/face-swap, no reliable figure found — estimate ~$0.02-0.05/run", generationType: "image", requiredTier: "pro" },

  // ── AutoClip (2026-09 pricing audit) ──────────────────────────────────────
  // Both of these were missing entirely: the flagship feature and its newest
  // add-on had no cost basis anywhere, so they contributed nothing to the admin
  // AI-spend and margin dashboards even though AutoClip is the most expensive
  // thing the product runs.
  //
  // auto-clip is genuinely multi-provider (STT + Gemini selection + GPU render +
  // S3), and its real per-run cost varies by an order of magnitude with source
  // length, so a single costUsd would be a lie — it stays null, like the other
  // unconfirmed entries. creditCost here is display-only: real billing is
  // duration- and clip-count-scaled through getAutoClipPricing (see
  // computeCreditCost / computeAnalysisCost in lib/autoclip-pipeline.ts), and
  // the value below is a representative 5-clip run.
  "auto-clip": {
    creditCost: 8, // representative: 5 clips + ~5 min output, at the default rates
    costUsd: null,
    costBasis: "ElevenLabs/Whisper STT + Gemini selection + GPU render + S3; scales with source length, no single per-run figure",
    generationType: "video",
  },
  // TODO verify-before-ship: ElevenLabs Dubbing is billed per minute of audio and
  // the exact rate could not be confirmed. Shipped at a flat 1 credit per dub
  // regardless of clip length, which is the same shape as the pre-audit
  // ai-creator price that turned out to be loss-making. Now duration-scaled
  // (dubPerMinute in AUTOCLIP_PRICING_DEFAULTS, admin-editable) and gated pro+
  // until the real figure is confirmed — pro-tier credit revenue gives enough
  // margin buffer for an unknown per-minute cost, exactly the mitigation
  // subtitle-remover and face-swap already use.
  "clip-dub": {
    creditCost: 2, // display price for a <=1 minute clip (dubPerMinute x 1)
    costUsd: null,
    costBasis: "ElevenLabs Dubbing API, billed per minute of audio — rate not yet confirmed",
    generationType: "audio",
    requiredTier: "pro",
  },
};

// "Starting at" display price for the two multi-model tools — kept in sync
// with the cheapest model in each registry so the public/admin display never
// drifts from what a user could actually pay. Video's "starting at" uses the
// cheapest model's rate at its own default duration.
export const IMAGE_GENERATOR_STARTING_CREDIT_COST = Math.min(...IMAGE_MODELS.map((m) => m.creditCost));
export const VIDEO_GENERATOR_STARTING_CREDIT_COST = Math.min(
  ...VIDEO_MODELS.map((m) => m.creditsPerSecond * m.minDurationSeconds),
);
