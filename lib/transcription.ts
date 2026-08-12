// Transcription with a provider chain, so a single vendor outage (or a
// misconfigured key) can't silently take out every transcript-dependent
// feature — AutoClip clip selection, burned-in captions, silence/filler
// removal and emphasis all read this.
//
// Order, first non-empty result wins:
//   1. ElevenLabs Scribe   (utils/elevenlabs.ts) — primary, best word timing.
//   2. OpenAI Whisper      — fallback when OPENAI_API_KEY is set.
//   3. fal.ai Whisper      — fallback when FAL_KEY is set (no extra account:
//      the app already uses fal for its video/image tools).
//
// A provider is only attempted when its key is present, so an unconfigured
// provider is skipped rather than counted as a failure. If every *available*
// provider throws, the original (highest-priority) error is surfaced — callers
// already treat a throw and an empty array identically (transcription_failed),
// so behaviour only ever improves: paths that used to give up now get a second
// and third chance on a key the deployment already has.

import { transcribeAudio as transcribeWithElevenLabs, type WordTiming } from "@/utils/elevenlabs";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type { WordTiming };

async function transcribeWithWhisper(audioBuffer: Buffer, mimeType: string): Promise<WordTiming[]> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), "audio.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await withRetry(
    (signal) => fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    }),
    { timeoutMs: 60_000 },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper STT error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as { words?: { word: string; start: number; end: number }[] };
  return (json.words ?? [])
    .filter((w) => w.word.trim())
    .map((w) => ({
      word: w.word.trim(),
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000),
    }));
}

// fal.ai's Whisper endpoint returns word-level chunks as
// `{ chunks: [{ timestamp: [startSec, endSec], text }] }`. Whisper occasionally
// emits a null end timestamp on the trailing chunk; we drop any chunk without a
// usable [start, end] pair rather than shipping NaN timings into the caption
// renderer. Pure and exported so the mapping is unit-tested without a network
// call — the risk here is the response shape, not the HTTP.
interface FalWhisperChunk {
  timestamp?: [number | null, number | null] | null;
  text?: string;
}
export function mapFalWhisperChunks(raw: unknown): WordTiming[] {
  const chunks = (raw as { chunks?: FalWhisperChunk[] } | null)?.chunks;
  if (!Array.isArray(chunks)) return [];
  const out: WordTiming[] = [];
  for (const c of chunks) {
    const word = (c?.text ?? "").trim();
    const start = c?.timestamp?.[0];
    const end = c?.timestamp?.[1];
    if (!word || typeof start !== "number" || typeof end !== "number") continue;
    out.push({ word, start: Math.round(start * 1000), end: Math.round(end * 1000) });
  }
  return out;
}

async function transcribeWithFal(audioBuffer: Buffer, mimeType: string): Promise<WordTiming[]> {
  if (!env.FAL_KEY) return [];
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: env.FAL_KEY });

  // Passing a File lets the client upload the audio to fal storage and swap in
  // the resulting URL — the whole source's audio (tens of MB on a long video)
  // is far too large to inline as a data URI in the queue POST body.
  //
  // Language is left to Whisper's auto-detect: the fal client types `language`
  // as a fixed enum of codes (not a free string), the sole caller doesn't pass
  // one, and Whisper's detection is reliable — so forcing it here would buy a
  // brittle cast for no real gain.
  const file = new File([new Uint8Array(audioBuffer)], "audio.mp3", { type: mimeType });
  const result = await fal.subscribe("fal-ai/whisper", {
    input: {
      audio_url: file,
      task: "transcribe",
      chunk_level: "word",
    },
  });
  // v1 client returns { data, requestId }; tolerate a bare payload too.
  const data = (result as { data?: unknown })?.data ?? result;
  return mapFalWhisperChunks(data);
}

interface Provider {
  name: string;
  available: boolean;
  run: () => Promise<WordTiming[]>;
}

// Same return shape as before ([] on total failure, or when nothing is
// configured), so every call site keeps degrading exactly as it did.
export async function transcribe(
  audioBuffer: Buffer,
  mimeType = "audio/mpeg",
  languageCode?: string,
): Promise<WordTiming[]> {
  const providers: Provider[] = [
    {
      name: "elevenlabs",
      available: !!env.ELEVENLABS_API_KEY,
      run: () => transcribeWithElevenLabs(audioBuffer, mimeType, languageCode),
    },
    {
      name: "whisper",
      available: !!env.OPENAI_API_KEY,
      run: () => transcribeWithWhisper(audioBuffer, mimeType),
    },
    {
      name: "fal",
      available: !!env.FAL_KEY,
      run: () => transcribeWithFal(audioBuffer, mimeType),
    },
  ].filter((p) => p.available);

  if (providers.length === 0) return [];

  let firstError: unknown = null;
  for (const p of providers) {
    try {
      const words = await p.run();
      if (words.length > 0) return words;
      // Available provider returned nothing (genuinely no speech, or a soft
      // failure) — try the next one before giving up.
      logger.warn("transcription", `${p.name} returned no words, trying next provider`);
    } catch (err) {
      if (firstError === null) firstError = err;
      logger.warn("transcription", `${p.name} STT failed, trying next provider`, err);
    }
  }

  // Every available provider errored — surface the primary provider's error so
  // the failure is diagnosable. If they merely returned empty, that's a
  // legitimate "no speech" result.
  if (firstError !== null) throw firstError;
  return [];
}
