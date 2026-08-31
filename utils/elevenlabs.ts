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
  /** Scribe speaker label (e.g. "speaker_0") when diarization was requested
   * and the provider returned one — optional so Whisper/fal transcripts
   * (which never set it) stay valid. Not yet consumed anywhere in the
   * caption-rendering pipeline; this only makes the data available. */
  speaker?: string;
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

// Thrown by fetchElevenLabs for any response it doesn't treat as success —
// carries what withRetry's isRetryable/retryDelayMs need to classify it, and
// what each call site needs to build its final user-facing/log message.
export class ElevenLabsHttpError extends Error {
  constructor(context: string, readonly status: number, readonly body: string, readonly retryAfterMs?: number) {
    super(`${context} ${status}: ${body}`);
    this.name = "ElevenLabsHttpError";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * fetch() against the ElevenLabs API with retry-on-429/5xx, not just
 * network failures/timeouts — a rate-limited or overloaded response is a
 * RESOLVED fetch, which withRetry alone never sees, so every call site used
 * to treat one 429 as a hard failure. Honors a `Retry-After` header when
 * ElevenLabs sends one instead of the default exponential backoff.
 *
 * Returns a Response that is always .ok (or in `okStatuses`, for callers
 * like deleteClonedVoice that treat 404 as success) — throws
 * ElevenLabsHttpError once retries are exhausted, so callers no longer need
 * their own `!res.ok` check.
 */
export async function fetchElevenLabs(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; errorContext: string; okStatuses?: number[] },
): Promise<Response> {
  const okStatuses = opts.okStatuses ?? [];
  return withRetry(
    async (signal) => {
      const res = await fetch(url, { ...init, signal });
      if (res.ok || okStatuses.includes(res.status)) return res;

      const body = await res.text();
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      throw new ElevenLabsHttpError(opts.errorContext, res.status, body, Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : undefined);
    },
    {
      timeoutMs: opts.timeoutMs,
      isRetryable: (err) => err instanceof ElevenLabsHttpError && isRetryableStatus(err.status),
      retryDelayMs: (err) => (err instanceof ElevenLabsHttpError ? err.retryAfterMs : undefined),
    },
  );
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
  const res = await fetchElevenLabs(
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
    },
    { timeoutMs: 30_000, errorContext: "ElevenLabs error" },
  );

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
  form.append("diarize", "true");
  if (languageCode && languageCode !== "auto") form.append("language_code", languageCode);

  const res = await fetchElevenLabs(
    "https://api.elevenlabs.io/v1/speech-to-text",
    { method: "POST", headers: { "xi-api-key": apiKey }, body: form },
    { timeoutMs: 60_000, errorContext: "ElevenLabs STT error" },
  );

  const json = (await res.json()) as {
    words?: { text: string; start: number; end: number; type?: string; speaker_id?: string }[];
  };

  // Scribe returns word / spacing / audio_event entries — keep only real words.
  return (json.words ?? [])
    .filter((w) => (w.type ?? "word") === "word" && w.text.trim())
    .map((w) => ({
      word: w.text.trim(),
      start: Math.round(w.start * 1000),
      end: Math.round(w.end * 1000),
      ...(w.speaker_id ? { speaker: w.speaker_id } : {}),
    }));
}

// Aligns known text to audio that actually contains it — used for dubbed
// clips, where translateTranscript() already produced the right words but
// only heuristic timing (normaliseSpan() in lib/caption-translate.ts: trust
// the model's own timestamps if they're coherent, otherwise spread evenly).
// Real alignment against the dubbed audio is strictly better when available.
// Returns [] on no API key or no usable words, same degrade-gracefully
// contract as transcribeAudio() — callers should fall back to whatever
// timing they already had, not treat this as fatal.
export async function forcedAlign(audioBuffer: Buffer, text: string): Promise<WordTiming[]> {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey || !text.trim()) return [];

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("text", text);

  const res = await fetchElevenLabs(
    "https://api.elevenlabs.io/v1/forced-alignment",
    { method: "POST", headers: { "xi-api-key": apiKey }, body: form },
    { timeoutMs: 30_000, errorContext: "ElevenLabs forced-alignment error" },
  );

  const json = (await res.json()) as {
    words?: { text: string; start: number; end: number; loss?: number }[];
  };

  return (json.words ?? [])
    .filter((w) => w.text.trim())
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

  const res = await fetchElevenLabs(
    "https://api.elevenlabs.io/v1/dubbing",
    { method: "POST", headers: { "xi-api-key": apiKey }, body: form },
    { timeoutMs: 30_000, errorContext: "ElevenLabs dubbing error" },
  );
  const json = (await res.json()) as { dubbing_id: string; expected_duration_sec?: number };
  return { dubbingId: json.dubbing_id, expectedDurationSec: json.expected_duration_sec };
}

export async function getDubbingStatus(dubbingId: string): Promise<"dubbing" | "dubbed" | "failed"> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  const res = await fetchElevenLabs(
    `https://api.elevenlabs.io/v1/dubbing/${dubbingId}`,
    { headers: { "xi-api-key": apiKey } },
    { timeoutMs: 10_000, errorContext: "ElevenLabs dubbing status error" },
  );
  const json = (await res.json()) as { status: string };
  if (json.status === "dubbed") return "dubbed";
  if (json.status === "failed") return "failed";
  return "dubbing";
}

export async function getDubbedAudio(dubbingId: string, lang: string): Promise<Buffer> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  const res = await fetchElevenLabs(
    `https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${lang}`,
    { headers: { "xi-api-key": apiKey } },
    { timeoutMs: 30_000, errorContext: "ElevenLabs dubbed audio error" },
  );
  return Buffer.from(await res.arrayBuffer());
}

// Moved to lib/languages.ts (dependency-free, safe for client import) —
// re-exported here so existing server-side imports of DUB_LANGUAGES from
// this module keep working unchanged.
export { DUB_LANGUAGES } from "@/lib/languages";

export async function listVoices(): Promise<{ voice_id: string; name: string; preview_url: string }[]> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  const res = await fetchElevenLabs(
    "https://api.elevenlabs.io/v1/voices",
    { headers: { "xi-api-key": apiKey } },
    { timeoutMs: 10_000, errorContext: "ElevenLabs voices error" },
  );
  const json = (await res.json()) as { voices: { voice_id: string; name: string; preview_url: string }[] };
  return json.voices;
}

// The ElevenLabs account backing this app is shared across every Clipiro
// user — its voice-slot limit is a property of the account, not of any one
// user. Default is deliberately conservative; the real ceiling depends on
// the ElevenLabs plan and should be set via ELEVENLABS_MAX_VOICE_SLOTS.
const DEFAULT_MAX_VOICE_SLOTS = 100;

function maxVoiceSlots(): number {
  const n = Number(env.ELEVENLABS_MAX_VOICE_SLOTS ?? DEFAULT_MAX_VOICE_SLOTS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_VOICE_SLOTS;
}

// How many more voices (of any kind — stock + cloned) the shared account can
// hold before hitting ElevenLabs' own limit. Callers should check this
// *before* cloneVoice() — a breached shared limit is a hard outage for every
// user's cloning attempt, not a per-user problem, so it must never be
// discovered only when the vendor call itself fails.
export async function elevenLabsVoiceSlotsRemaining(): Promise<number> {
  const voices = await listVoices();
  return Math.max(0, maxVoiceSlots() - voices.length);
}

export interface ClonedVoiceResult {
  voiceId: string;
}

// ElevenLabs Instant Voice Cloning: one short sample in, a reusable voice_id
// out. That id is then usable anywhere a voice slug already is —
// resolveVoiceId() (utils/voice-ids.ts) passes through any string it
// doesn't recognize as a stock slug, so the synthesis/preview pipeline
// needs no changes at all to support a cloned voice.
export async function cloneVoice(name: string, sampleAudio: Buffer, filename: string): Promise<ClonedVoiceResult> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  const form = new FormData();
  form.append("name", name);
  form.append("files", new Blob([new Uint8Array(sampleAudio)]), filename);

  const res = await fetchElevenLabs(
    "https://api.elevenlabs.io/v1/voices/add",
    { method: "POST", headers: { "xi-api-key": apiKey }, body: form },
    { timeoutMs: 30_000, errorContext: "ElevenLabs voice clone failed" },
  );
  const json = (await res.json()) as { voice_id: string };
  return { voiceId: json.voice_id };
}

export async function deleteClonedVoice(voiceId: string): Promise<void> {
  const apiKey = env.ELEVENLABS_API_KEY!;
  await fetchElevenLabs(
    `https://api.elevenlabs.io/v1/voices/${voiceId}`,
    { method: "DELETE", headers: { "xi-api-key": apiKey } },
    { timeoutMs: 10_000, errorContext: "ElevenLabs voice delete failed", okStatuses: [404] },
  );
}
