// ElevenLabs Music generation. SERVER ONLY.
//
// This is the replacement for the S3 track library, not an addition to it: the
// bucket has no `music/` prefix, every one of the 13 catalogued tracks pointed
// at an object that does not exist, and rather than source and upload royalty-
// free audio we generate a bed per video.
//
// ── VERIFIED LIVE 2026-09-10 against POST /v1/music ──────────────────────────
//   * body takes exactly one of `prompt` or `composition_plan` (422 otherwise)
//   * music_length_ms is bounded [3000, 600000] — the API enforces both ends
//   * model_id accepts "music_v1" and "music_v2"; anything else is a 422
//   * output_format is a QUERY parameter, not a body field
//   * the response body is raw audio bytes, NOT JSON like /v1/text-to-speech
//   * on a free plan every call is 402 `paid_plan_required`:
//     "Music API is not available for free users."
//
// That last one is why isMusicGenerationAvailable() exists and why callers
// surface `music_generation_unavailable` rather than a generic failure. A
// paid-plan gate is not a bug to retry — it is a fact to report.

import { fetchElevenLabs, isElevenLabsConfigured } from "@/utils/elevenlabs";
import { env } from "@/lib/env";

/** The API's own bounds, not ours. Enforced here so a bad request never ships. */
export const MIN_MUSIC_MS = 3_000;
export const MAX_MUSIC_MS = 600_000;

/** What we ask for when a caller doesn't say. 30s loops under a short video. */
export const DEFAULT_MUSIC_MS = 30_000;

/** Longest prompt we accept. The API takes more; a UI textarea should not. */
export const MAX_PROMPT_CHARS = 500;

const MUSIC_MODEL_ID = "music_v2";

export interface MusicGenerationResult {
  audio: Buffer;
  /** Echoed back so a caller can record what it actually asked for. */
  prompt: string;
  lengthMs: number;
  modelId: string;
}

/**
 * Thrown when the account cannot use the Music API at all — a plan limit, not
 * a transient failure. Callers must not retry it and must not refund silently:
 * the user needs to be told the feature is unavailable, not that it "failed".
 */
export class MusicPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicPlanError";
  }
}

/** Cheap pre-flight so a route can 503 before charging anyone. */
export function isMusicGenerationAvailable(): boolean {
  return isElevenLabsConfigured();
}

function clampLength(ms: number | undefined): number {
  const n = Number.isFinite(ms) ? Number(ms) : DEFAULT_MUSIC_MS;
  return Math.min(MAX_MUSIC_MS, Math.max(MIN_MUSIC_MS, Math.round(n)));
}

/**
 * Generate one instrumental bed. Returns the mp3 bytes; storing them is the
 * caller's business, because a render wants a temp file and the tool route
 * wants an S3 object.
 */
export async function generateMusic(opts: {
  prompt: string;
  lengthMs?: number;
  /** Overrides the default model. Only "music_v1" / "music_v2" are valid. */
  modelId?: string;
}): Promise<MusicGenerationResult> {
  const prompt = opts.prompt.trim();
  if (!prompt) throw new Error("A prompt is required to generate music");
  if (!isMusicGenerationAvailable()) {
    throw new MusicPlanError("Music generation is not configured");
  }

  const lengthMs = clampLength(opts.lengthMs);
  const modelId = opts.modelId ?? MUSIC_MODEL_ID;

  const res = await fetchElevenLabs(
    "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, music_length_ms: lengthMs, model_id: modelId }),
    },
    {
      // Generation is slow — a 30s bed took noticeably longer than a TTS call
      // in every provider example. 120s matches the route's maxDuration.
      timeoutMs: 120_000,
      errorContext: "ElevenLabs Music error",
      // 402 must reach us as a response, not a retried error: the retry
      // wrapper would otherwise spend three attempts re-learning that the
      // plan does not allow this.
      okStatuses: [402],
    },
  );

  if (res.status === 402) {
    const body = await res.text().catch(() => "");
    throw new MusicPlanError(
      body.includes("free users")
        ? "Music generation requires a paid ElevenLabs plan."
        : "Music generation is not available on the current ElevenLabs plan.",
    );
  }

  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new Error("Music generation returned no audio");

  return { audio, prompt, lengthMs, modelId };
}
