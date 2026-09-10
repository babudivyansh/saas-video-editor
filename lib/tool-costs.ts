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
  // TODO verify-before-ship: Submagic does not publish a per-minute API rate,
  // and confirming one requires an invoice against real usage — creating a
  // project is the billable act, so it cannot be probed for free. Two
  // mitigations, the same pair clip-dub and subtitle-remover already use:
  //
  //   1. Gated creator+ (see SUBMAGIC_ROUTING_DEFAULTS.tiers in
  //      lib/captions/CaptionRendererFactory.ts), so credit revenue absorbs an
  //      unknown provider rate.
  //   2. Priced per BILLABLE minute, not per render — providers in this
  //      category round a partial minute up to a whole one, so a 12-second clip
  //      and a 59-second clip cost the same. billableMinutes() in
  //      lib/captions/pricing.ts encodes that, and it is the reason §26 of the
  //      spec insists only user-selected clips get a provider render.
  //
  // creditCost here is display-only; real billing is duration-scaled through
  // getCaptionRenderPricing (admin-editable, no deploy). Replace the null with
  // the confirmed rate — computed as cost x margin / REVENUE_FLOOR_USD_PER_CREDIT
  // per lib/models/videoModels.ts's header — then drop the tier gate and shrink
  // the allowlist entry in scripts/check-unverified-costs.mjs back to 2.
  "caption-render": {
    creditCost: 8, // display price for a <=1 minute clip (perBillableMinute x 1)
    costUsd: null,
    costBasis: "Submagic animated-caption render, billed per billable minute — rate not published, not yet confirmed",
    generationType: "video",
    requiredTier: "creator",
  },

  // ── Features that charge credits but had no entry here ──────────────────
  //
  // Every one of these already deducted credits through spendCredits or
  // chargeCredits with a local CREDIT_COST constant, so users were billed —
  // but the admin AI-spend and margin dashboards aggregate Generation rows
  // keyed off THIS map, so none of them reached cost reporting at all. The
  // numbers below are the constants those routes already use: this makes them
  // visible, it does not change anyone's price.
  "generate-voice":     { creditCost: 2, costUsd: 0.10, costBasis: "$0.05/1,000 chars (ElevenLabs Flash TTS), 2,000-char cap — same price as the voiceover tool", generationType: "audio" },
  "voice-preview":      { creditCost: 0, costUsd: 0.002, costBasis: "One ~35-char TTS sample. Free to the user; authenticated and capped at 20/hr so the cost is bounded by accounts, not IPs", generationType: "audio" },
  "music-generate":     { creditCost: 4, costUsd: 0.075, costBasis: "ElevenLabs Music $0.15/min, 30s default bed (verify-before-ship: the Music API is paid-plan only and 402s on the current free account, so this rate is published pricing, not a measured call). Gated creator+", generationType: "audio" },
  "split-screen":       { creditCost: 1, costUsd: null, costBasis: "Scribe/Whisper STT + FFmpeg render", generationType: "video" },
  "streamer-video":     { creditCost: 1, costUsd: null, costBasis: "Scribe/Whisper STT + FFmpeg render", generationType: "video" },
  "compile":            { creditCost: 1, costUsd: 0, costBasis: "FFmpeg render only — TTS is charged when the voice is generated", generationType: "video" },
  "editor-render":      { creditCost: 1, costUsd: 0, costBasis: "FFmpeg timeline render (local compute only)", generationType: "video" },
  "editor-captions":    { creditCost: 1, costUsd: null, costBasis: "Scribe/Whisper STT over the timeline audio", generationType: "utility" },
  "editor-ai-text":     { creditCost: 1, costUsd: 0, costBasis: "Google Gemini text — near-zero per call", generationType: "utility" },
  "auto-clip-rerender": { creditCost: 1, costUsd: 0, costBasis: "FFmpeg re-render of one clip (local compute only)", generationType: "video" },

  // Script generation. Free until now, while brainstormer — the same class of
  // Gemini call — charged 1. Priced to match that precedent rather than to
  // recover cost: the real per-call spend is a fraction of a credit.
  "script-generic":     { creditCost: 1, costUsd: 0, costBasis: "Google Gemini text (~150-200 words)", generationType: "utility" },
  "script-reddit":      { creditCost: 1, costUsd: 0, costBasis: "Google Gemini text (150-350 words)", generationType: "utility" },
  "script-text-video":  { creditCost: 1, costUsd: 0, costBasis: "Google Gemini text (6-10 short messages)", generationType: "utility" },
};

// "Starting at" display price for the two multi-model tools — kept in sync
// with the cheapest model in each registry so the public/admin display never
// drifts from what a user could actually pay. Video's "starting at" uses the
// cheapest model's rate at its own default duration.
export const IMAGE_GENERATOR_STARTING_CREDIT_COST = Math.min(...IMAGE_MODELS.map((m) => m.creditCost));
export const VIDEO_GENERATOR_STARTING_CREDIT_COST = Math.min(
  ...VIDEO_MODELS.map((m) => m.creditsPerSecond * m.minDurationSeconds),
);
