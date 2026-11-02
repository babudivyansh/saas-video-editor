// Length-scaled prices for the audio tools (2026-09-26 pricing plan, Stage 5).
//
// Leaf module — no prisma, no ffmpeg — so each tool page quotes with the same
// function its route charges with.
//
// These were flat prices with a length cap, which charged a 10-second clip the
// same as a 90-second one and, at the net revenue floor ($0.0784/credit after
// GST and the gateway, lib/plans/tiers.ts), several were under 3x cost at the
// cap. Each rate below is ceil(provider cost x 3 / $0.0784) per unit:
//
//   voiceover       see VOICEOVER_* below — the provider rate depends on the model
//                   and on the ElevenLabs plan, not on one published number
//   vocal-remover   fal Demucs $0.0007/s = $0.042/min        -> 1 credit / 30 s
//   voice-changer   ElevenLabs speech-to-speech ~$0.20/min   -> 8 credits / min
//   enhance-speech  ElevenLabs voice isolation ~$0.20/min    -> 8 credits / min
//
// Every price rounds UP and is at least 1 credit: the provider bills a whole
// request however short it is.

// Voiceover, re-priced 2026-11-01. The old rate (1 credit / 500 chars) assumed
// ElevenLabs' $0.05 per 1,000 Flash characters, which is the Business-plan
// price. On the plans this account can realistically sit on (Starter to Scale)
// one ElevenLabs credit costs $0.165-$0.22 per 1,000, so:
//
//   standard  eleven_v4_turbo / flash, 0.5 credits per char  ~$0.10 / 1,000 chars
//   studio    eleven_v4,               1.0 credit per char   ~$0.20 / 1,000 chars
//
// At $0.0784 net per Clipiro credit those rates come to ~2.6x cost on Pro
// (about 3x on Scale): see audio-pricing.test.ts for the arithmetic.
export const VOICEOVER_CHARS_PER_CREDIT = 300;
export const VOICEOVER_STUDIO_CHARS_PER_CREDIT = 150;

/** "standard" = the fast 0.5x model; "studio" = the full-quality 1.0x model. */
export type VoiceoverQuality = "standard" | "studio";
export const VOCAL_REMOVER_SECONDS_PER_CREDIT = 30;
export const VOICE_FX_CREDITS_PER_MINUTE = 8;

export type AudioTool = "voiceover" | "vocal-remover" | "voice-changer" | "enhance-speech";

/**
 * Credits for one voiceover. `multiplier` is the voice's own provider rate
 * (lib/voices/catalog.ts creditMultiplier): a 2x Voice Library voice bills the
 * account twice per character, so it has to bill the user twice too.
 */
export function voiceoverCredits(chars: number, quality: VoiceoverQuality = "standard", multiplier = 1): number {
  const per = quality === "studio" ? VOICEOVER_STUDIO_CHARS_PER_CREDIT : VOICEOVER_CHARS_PER_CREDIT;
  return withVoiceMultiplier(Math.max(1, Math.ceil(Math.max(0, chars) / per)), multiplier);
}

/** Scales a price by a voice's provider rate. Never below the base price. */
export function withVoiceMultiplier(credits: number, multiplier: number): number {
  const m = Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
  return Math.ceil(credits * m);
}

export function vocalRemoverCredits(durationSec: number): number {
  return Math.max(1, Math.ceil(Math.max(0, durationSec) / VOCAL_REMOVER_SECONDS_PER_CREDIT));
}

/** Voice changer and speech enhancer: same provider tier, same per-minute rate. */
export function voiceFxCredits(durationSec: number): number {
  return Math.max(1, Math.ceil((Math.max(0, durationSec) / 60) * VOICE_FX_CREDITS_PER_MINUTE));
}

/** One-line rate for the tool pages and the public cost table. */
export const AUDIO_RATE_LABEL: Record<AudioTool, string> = {
  voiceover: `1 credit per ${VOICEOVER_CHARS_PER_CREDIT} characters (${VOICEOVER_STUDIO_CHARS_PER_CREDIT} in Studio quality)`,
  "vocal-remover": `1 credit per ${VOCAL_REMOVER_SECONDS_PER_CREDIT} seconds`,
  "voice-changer": `${VOICE_FX_CREDITS_PER_MINUTE} credits per minute`,
  "enhance-speech": `${VOICE_FX_CREDITS_PER_MINUTE} credits per minute`,
};
