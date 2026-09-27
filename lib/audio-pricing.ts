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
//   voiceover       ElevenLabs Flash TTS $0.05 / 1,000 chars -> 1 credit / 500 chars
//   vocal-remover   fal Demucs $0.0007/s = $0.042/min        -> 1 credit / 30 s
//   voice-changer   ElevenLabs speech-to-speech ~$0.20/min   -> 8 credits / min
//   enhance-speech  ElevenLabs voice isolation ~$0.20/min    -> 8 credits / min
//
// Every price rounds UP and is at least 1 credit: the provider bills a whole
// request however short it is.

export const VOICEOVER_CHARS_PER_CREDIT = 500;
export const VOCAL_REMOVER_SECONDS_PER_CREDIT = 30;
export const VOICE_FX_CREDITS_PER_MINUTE = 8;

export type AudioTool = "voiceover" | "vocal-remover" | "voice-changer" | "enhance-speech";

export function voiceoverCredits(chars: number): number {
  return Math.max(1, Math.ceil(Math.max(0, chars) / VOICEOVER_CHARS_PER_CREDIT));
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
  voiceover: `1 credit per ${VOICEOVER_CHARS_PER_CREDIT} characters`,
  "vocal-remover": `1 credit per ${VOCAL_REMOVER_SECONDS_PER_CREDIT} seconds`,
  "voice-changer": `${VOICE_FX_CREDITS_PER_MINUTE} credits per minute`,
  "enhance-speech": `${VOICE_FX_CREDITS_PER_MINUTE} credits per minute`,
};
