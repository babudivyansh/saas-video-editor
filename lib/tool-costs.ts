import type { TierId } from "@/lib/plans/tiers";
import { IMAGE_MODELS } from "@/lib/models/imageModels";

export interface ToolCost {
  /** Flat credits per generation (per unit for the duration-scaled audio tools). */
  creditCost: number;
  /** Real provider $ cost — null where no reliable figure exists yet. */
  costUsd: number | null;
  costBasis: string;
  generationType: "image" | "video" | "audio" | "utility";
  /** Omit = open to everyone (incl. free). Set on tools whose provider cost
   * is unverified (subtitle-remover, face-swap). */
  requiredTier?: TierId;
}

// Source of truth for every AI tool's credit cost EXCEPT image-generator,
// which reads per-model costs from lib/models/imageModels.ts instead (it has
// multiple swappable providers; these tools each have exactly one). lib/tool-config.ts's TOOL_DEFAULTS re-exports
// creditCost from here so there's a single source of truth for the number —
// previously TOOL_DEFAULTS hardcoded its own copy, disconnected from the
// cost-rationale comments already living in each route.
export const TOOL_COSTS: Record<string, ToolCost> = {
  "audio-balancer":   { creditCost: 0, costUsd: 0, costBasis: "FFmpeg (local compute only)", generationType: "utility" },
  "mp3-converter":    { creditCost: 0, costUsd: 0, costBasis: "FFmpeg (local compute only)", generationType: "utility" },
  "video-compressor": { creditCost: 0, costUsd: 0, costBasis: "FFmpeg (local compute only)", generationType: "utility" },
  "enhance-prompt":   { creditCost: 0, costUsd: 0, costBasis: "Google Gemini text, negligible cost", generationType: "utility" },
  // Free since 2026-09-26 under a daily fair-use cap (lib/fair-use.ts), like the
  // other single-call Gemini text tools below: ~$0.0005 a call against a 1-credit
  // (~$0.08) price was ~80x cost and mostly felt petty.
  "brainstormer":     { creditCost: 0, costUsd: 0.0005, costBasis: "Google Gemini text, one call — free under a daily fair-use cap", generationType: "utility" },
  // Social Tracker v2 AI layer. All of these send a ≤2 kB factsheet of numbers
  // the deterministic engine already computed and get back a few hundred tokens
  // of prose — genuinely sub-cent per call, same basis as brainstormer above.
  // Prices are relative effort, not cost recovery: the exec report fans out over
  // a whole period and several accounts, kpi-explain is a tooltip and is free
  // (and cached 24h on rounded values, so an idle dashboard never re-bills).
  // 5 -> 2 and 3 -> 1 on 2026-10-30: at ~$0.001 a call they were 390x and
  // 235x cost, and read as petty next to the free Gemini tools.
  "social-exec-report":   { creditCost: 2, costUsd: null, costBasis: "Google Gemini text over a computed multi-account period factsheet, near-zero real cost", generationType: "utility" },
  "social-content-recs":  { creditCost: 1, costUsd: null, costBasis: "Google Gemini text over computed post scores, near-zero real cost", generationType: "utility" },
  "social-caption":       { creditCost: 0, costUsd: 0.0005, costBasis: "Google Gemini text, near-zero real cost", generationType: "utility" },
  "social-post-narration": { creditCost: 0, costUsd: 0.0005, costBasis: "Google Gemini text, batched 10 posts per call, near-zero real cost", generationType: "utility" },
  "social-kpi-explain":   { creditCost: 0, costUsd: null, costBasis: "Google Gemini text, cached 24h on rounded metric values, near-zero real cost", generationType: "utility" },
  // Local renders (cut-and-crop, editor-render) are free on a paid plan up to
  // 30 a day and 1 credit otherwise — lib/render-pricing.ts decides per call;
  // creditCost is the free-plan price the cost table shows.
  "cut-and-crop":     { creditCost: 1, costUsd: 0, costBasis: "FFmpeg (local compute only) — free on paid plans up to 30 renders a day", generationType: "utility" },
  // Duration-scaled (2-20 credits — see creditCostForDuration in the route)
  // since Phase 2 replaced the old fixed-band blur with real per-frame OCR
  // detection (fal-ai/florence-2-large/ocr-with-region) — no longer FFmpeg-only.
  // TODO verify-before-ship: real per-call OCR cost couldn't be confirmed
  // live (fal.ai account balance was exhausted during implementation); this
  // display value and the route's cost formula are both placeholders.
  // Gated pro+ until the real OCR cost is confirmed: pro-tier credit revenue
  // (~₹15.7/cr) gives enough margin buffer for an unknown per-frame cost.
  "subtitle-remover": { creditCost: 4, costUsd: null, costBasis: "fal-ai/florence-2-large OCR per sampled frame + FFmpeg render, cost not yet confirmed", generationType: "video", requiredTier: "pro" },
  // Audio tools are priced by LENGTH since 2026-09-26 (lib/audio-pricing.ts);
  // creditCost/costUsd here are per UNIT — the "from" price the tools page and
  // cost table show — and the route charges units x rate.
  "voiceover":        { creditCost: 1, costUsd: 0.025, costBasis: "Per 500 characters: $0.05/1,000 chars (ElevenLabs Flash TTS), 2,000-char cap", generationType: "audio" },
  "vocal-remover":    { creditCost: 1, costUsd: 0.021, costBasis: "Per 30 seconds: $0.0007/s (fal.ai Demucs), 5-min cap", generationType: "audio" },
  // Fixed in Phase 1: was 2cr flat (≈$0.20 revenue) against real cost that could
  // run $1-2/generation uncapped — a confirmed loss-making price. Now
  // duration-scaled.
  "voice-changer":    { creditCost: 8, costUsd: 0.20, costBasis: "Per minute: ~$0.20/min (ElevenLabs speech-to-speech), 90s cap", generationType: "audio" },
  "enhance-speech":   { creditCost: 8, costUsd: 0.20, costBasis: "Per minute: ~$0.20/min (ElevenLabs voice isolation), 90s cap", generationType: "audio" },
  // Free since 2026-10-30 (the pricing page always called them free), capped
  // at 25 a day by lib/free-tool-caps.ts.
  "youtube-downloader":   { creditCost: 0, costUsd: 0, costBasis: "yt-dlp, bandwidth only — free, 25 a day", generationType: "utility" },
  "instagram-downloader": { creditCost: 0, costUsd: 0, costBasis: "yt-dlp, bandwidth only — free, 25 a day", generationType: "utility" },
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
  // Since 2026-09-26 a run is billed in CLIP MINUTES (1 per source minute, see
  // lib/autoclip-minutes.ts), so it spends no credits: creditCost is 0 and the
  // public cost table labels it in minutes (app/api/tool-costs). costUsd is
  // the audited cost PER SOURCE MINUTE on the GPU face-tracking path — Scribe
  // $0.0037 + RunPod ASD ~$0.0058 (estimate) + Gemini + render/S3.
  "auto-clip": {
    creditCost: 0,
    costUsd: 0.0125,
    costBasis: "Per source minute: ElevenLabs Scribe STT + RunPod ASD face tracking (estimate) + Gemini selection + render/S3",
    generationType: "video",
  },
  // TODO verify-before-ship: ElevenLabs Dubbing is billed per minute of audio.
  // $0.50/min (no watermark) is the PUBLISHED API rate as of 2026-09-26, not a
  // measured invoice — the account is on the free tier. Duration-scaled
  // (dubPerMinute in AUTOCLIP_PRICING_DEFAULTS, admin-editable) at
  // ceil(0.50*3/0.0784) = 20 cr/min; it was 2 cr/min, a loss on every dub.
  // Stays gated pro+ until an invoice confirms the rate.
  "clip-dub": {
    creditCost: 20, // display price for a <=1 minute clip (dubPerMinute x 1)
    costUsd: 0.50,
    costBasis: "ElevenLabs Dubbing API, $0.50 per source minute (published rate, not yet invoice-confirmed)",
    generationType: "audio",
    requiredTier: "pro",
  },

  // ── Features that charge credits but had no entry here ──────────────────
  //
  // Every one of these already deducted credits through spendCredits or
  // chargeCredits with a local CREDIT_COST constant, so users were billed —
  // but the admin AI-spend and margin dashboards aggregate Generation rows
  // keyed off THIS map, so none of them reached cost reporting at all. The
  // numbers below are the constants those routes already use: this makes them
  // visible, it does not change anyone's price.
  "generate-voice":     { creditCost: 1, costUsd: 0.025, costBasis: "Per 500 characters: $0.05/1,000 chars (ElevenLabs Flash TTS) — same rate as the voiceover tool", generationType: "audio" },
  "voice-preview":      { creditCost: 0, costUsd: 0.002, costBasis: "One ~35-char TTS sample. Free to the user; authenticated and capped at 20/hr so the cost is bounded by accounts, not IPs", generationType: "audio" },
  "music-generate":     { creditCost: 4, costUsd: 0.075, costBasis: "ElevenLabs Music $0.15/min, 30s default bed (verify-before-ship: the Music API is paid-plan only and 402s on the current free account, so this rate is published pricing, not a measured call). Gated creator+", generationType: "audio" },
  "compile":            { creditCost: 1, costUsd: 0, costBasis: "FFmpeg render only — TTS is charged when the voice is generated", generationType: "video" },
  "editor-render":      { creditCost: 1, costUsd: 0, costBasis: "FFmpeg timeline render (local compute only) — free on paid plans up to 30 a day; 4K exports 3 credits", generationType: "video" },
  // Billed in Clip Minutes since 2026-09-26 (1 per minute of each asset, see
  // app/api/editor/captions/route.ts); creditCost 0 because it spends no credits.
  "editor-captions":    { creditCost: 0, costUsd: 0.0037, costBasis: "Scribe STT at $0.22/hour of the whole asset — billed 1 Clip Minute per 2 minutes (2026-10-30)", generationType: "utility" },
  "editor-ai-text":     { creditCost: 0, costUsd: 0.0005, costBasis: "Google Gemini text — free under a daily fair-use cap", generationType: "utility" },
  "auto-clip-rerender": { creditCost: 1, costUsd: 0, costBasis: "FFmpeg re-render of one clip (local compute only)", generationType: "video" },

  // Script generation. Free until now, while brainstormer — the same class of
  // Gemini call — charged 1. Priced to match that precedent rather than to
  // recover cost: the real per-call spend is a fraction of a credit.
  "script-generic":     { creditCost: 0, costUsd: 0.0005, costBasis: "Google Gemini text (~150-200 words)", generationType: "utility" },
};

// "Starting at" display price for the multi-model image tool — kept in sync
// with the cheapest model in the registry so the public/admin display never
// drifts from what a user could actually pay.
export const IMAGE_GENERATOR_STARTING_CREDIT_COST = Math.min(...IMAGE_MODELS.map((m) => m.creditCost));
