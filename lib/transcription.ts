// Transcription with a fallback provider. ElevenLabs Scribe (utils/elevenlabs.ts)
// is the primary — same behavior, same retries — but it's a hard single point
// of failure for both AutoClip clip selection and caption generation. When its
// own retries are exhausted, this falls back to OpenAI's Whisper API before
// giving up, instead of every downstream feature silently losing transcripts
// during an ElevenLabs outage. No OPENAI_API_KEY configured = this behaves
// exactly like calling transcribeAudio directly (fallback is a no-op).

import { transcribeAudio as transcribeWithElevenLabs, type WordTiming } from "@/utils/elevenlabs";
import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

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

// Same return shape as utils/elevenlabs.ts's transcribeAudio ([] on total
// failure) so every call site (Gemini prompt building, caption generation,
// computeKeeps) keeps degrading exactly as it already does — this only adds a
// second attempt in between "ElevenLabs failed" and "give up".
export async function transcribe(
  audioBuffer: Buffer,
  mimeType = "audio/mpeg",
  languageCode?: string,
): Promise<WordTiming[]> {
  try {
    return await transcribeWithElevenLabs(audioBuffer, mimeType, languageCode);
  } catch (err) {
    if (!env.OPENAI_API_KEY) throw err;
    logger.warn("transcription", "ElevenLabs STT failed, falling back to Whisper", err);
    try {
      return await transcribeWithWhisper(audioBuffer, mimeType);
    } catch (fallbackErr) {
      logger.error("transcription", "Whisper fallback also failed", fallbackErr);
      throw err; // surface the original (primary provider's) error to the caller
    }
  }
}
