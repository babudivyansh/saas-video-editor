import { withRetry } from "@/lib/with-retry";
import { env } from "@/lib/env";

// TTS model used for all synthesis (voiceover + video renders).
// eleven_flash_v2_5 is multilingual, supports /with-timestamps, and costs
// ~5-6x less than eleven_multilingual_v2 (the single biggest margin win).
// Flip back to "eleven_multilingual_v2" here if higher expressiveness is needed.
const TTS_MODEL_ID = "eleven_flash_v2_5";

export interface WordTiming {
  word: string;
  start: number; // milliseconds
  end: number;   // milliseconds
}

export interface VoiceResult {
  audioBuffer: Buffer;
  wordTimings: WordTiming[];
}

export interface VoiceSettings {
  stability?: number;       // 0..1
  similarityBoost?: number; // 0..1
  style?: number;           // 0..1 — exaggeration / expressiveness
  languageCode?: string;    // e.g. "en", "es", "fr" — passed to multilingual model
}

export async function synthesizeVoice(
  text: string,
  voiceId: string,
  settings?: VoiceSettings
): Promise<VoiceResult> {
  const apiKey = env.ELEVENLABS_API_KEY!;

  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const stability = settings?.stability != null ? clamp(settings.stability) : 0.5;
  const similarity_boost = settings?.similarityBoost != null ? clamp(settings.similarityBoost) : 0.75;
  const style = settings?.style != null ? clamp(settings.style) : 0.5;

  // Request with word-level timestamps
  const res = await withRetry(
    (signal) => fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL_ID,
          voice_settings: { stability, similarity_boost, style, use_speaker_boost: true },
          output_format: "mp3_44100_128",
          ...(settings?.languageCode && settings.languageCode !== "auto" ? { language_code: settings.languageCode } : {}),
        }),
        signal,
      }
    ),
    { timeoutMs: 30_000 },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  const audioBuffer = Buffer.from(json.audio_base64, "base64");

  // Build word-level timings from character alignment
  const wordTimings = buildWordTimings(json.alignment);

  return { audioBuffer, wordTimings };
}

function buildWordTimings(alignment: {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}): WordTiming[] {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const timings: WordTiming[] = [];
  let word = "";
  let wordStart = 0;

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (ch === " " || i === characters.length - 1) {
      if (ch !== " ") word += ch;
      if (word.trim()) {
        timings.push({
          word: word.trim(),
          start: Math.round(wordStart * 1000),
          end: Math.round(character_end_times_seconds[i] * 1000),
        });
      }
      word = "";
      wordStart = character_start_times_seconds[i + 1] ?? 0;
    } else {
      if (!word) wordStart = character_start_times_seconds[i];
      word += ch;
    }
  }

  return timings;
}

// Transcribe an audio file to word-level timings using ElevenLabs Scribe
// (speech-to-text). Returns [] if no API key is configured so callers can
// degrade gracefully (e.g. render without subtitles).
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType = "audio/mpeg",
  languageCode?: string, // undefined/"auto" = Scribe auto-detects the spoken language (previous, unchanged default)
): Promise<WordTiming[]> {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) return [];

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), "audio.mp3");
  form.append("model_id", "scribe_v1");
  if (languageCode && languageCode !== "auto") form.append("language_code", languageCode);

  const res = await withRetry(
    (signal) => fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal,
    }),
    { timeoutMs: 60_000 },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs STT error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    words?: { text: string; start: number; end: number; type?: string }[];
  };

  // Scribe returns word / spacing / audio_event entries — keep only real words.
  return (json.words ?? [])
    .filter((w) => (w.type ?? "word") === "word" && w.text.trim())
    .map((w) => ({
      word: w.text.trim(),
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000),
    }));
}

// ── AI Dubbing & translation (ElevenLabs Dubbing API) ────────────────────────
// Turns a video's speech into another language while preserving the speaker's
// voice. Async: start → poll status → fetch dubbed audio.

export interface DubbingJob { dubbingId: string; expectedDurationSec?: number }

export async function startDubbing(videoUrl: string, targetLang: string, sourceLang = "auto"): Promise<DubbingJob> {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs API key not configured");

  const form = new FormData();
  form.append("source_url", videoUrl);
  form.append("target_lang", targetLang);
  form.append("source_lang", sourceLang);
  form.append("num_speakers", "0"); // auto-detect

  const res = await withRetry(
    (signal) => fetch("https://api.elevenlabs.io/v1/dubbing", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal,
    }),
    { timeoutMs: 30_000 },
  );
  if (!res.ok) throw new Error(`ElevenLabs dubbing error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { dubbing_id: string; expected_duration_sec?: number };
  return { dubbingId: json.dubbing_id, expectedDurationSec: json.expected_duration_sec };
}

export async function getDubbingStatus(dubbingId: string): Promise<"dubbing" | "dubbed" | "failed"> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  const res = await withRetry(
    (signal) => fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}`, { headers: { "xi-api-key": apiKey }, signal }),
    { timeoutMs: 10_000 },
  );
  if (!res.ok) throw new Error(`ElevenLabs dubbing status error ${res.status}`);
  const json = (await res.json()) as { status: string };
  if (json.status === "dubbed") return "dubbed";
  if (json.status === "failed") return "failed";
  return "dubbing";
}

export async function getDubbedAudio(dubbingId: string, lang: string): Promise<Buffer> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  const res = await withRetry(
    (signal) => fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${lang}`, { headers: { "xi-api-key": apiKey }, signal }),
    { timeoutMs: 30_000 },
  );
  if (!res.ok) throw new Error(`ElevenLabs dubbed audio error ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Moved to lib/languages.ts (dependency-free, safe for client import) —
// re-exported here so existing server-side imports of DUB_LANGUAGES from
// this module keep working unchanged.
export { DUB_LANGUAGES } from "@/lib/languages";

export async function listVoices(): Promise<{ voice_id: string; name: string; preview_url: string }[]> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  const res = await withRetry(
    (signal) => fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey }, signal }),
    { timeoutMs: 10_000 },
  );
  if (!res.ok) throw new Error(`ElevenLabs voices error ${res.status}`);
  const json = (await res.json()) as { voices: { voice_id: string; name: string; preview_url: string }[] };
  return json.voices;
}
