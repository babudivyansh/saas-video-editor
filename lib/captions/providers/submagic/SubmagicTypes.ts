// Wire shapes for the Submagic REST API.
//
// VERIFICATION STATUS — probed live against https://api.submagic.co on
// 2026-09-06 with a real key. Anything marked UNVERIFIED below could not be
// confirmed without spending money (creating a project is a paid action), so
// it is written from Submagic's documented request shape and MUST be confirmed
// against a real project before this integration is trusted in production.
//
//   VERIFIED  GET /v1/templates  -> { templates: string[] }  (45 flat names,
//             no ids, no preview URLs, no categories — which is exactly why
//             Clipiro owns template metadata itself, see lib/caption-templates.ts)
//   VERIFIED  GET /v1/languages  -> { languages: { name, code }[] }  (127 entries;
//             "hi" Hindi and "ur" Urdu exist, there is NO Hinglish code)
//   VERIFIED  GET /v1/projects/{id} exists and requires a UUID
//   VERIFIED  there is NO GET /v1/projects list endpoint (404) — reconciliation
//             must poll per job id, it cannot enumerate
//   VERIFIED  errors: { error: "UNAUTHORIZED"|"VALIDATION_ERROR"|"NOT_FOUND", message }
//   VERIFIED  auth header is `x-api-key`
//   VERIFIED  rate limit headers: x-ratelimit-limit: 1000, -remaining, -reset
//             (unix seconds; observed window ~3600s, i.e. 1000/hour account-wide)
//
//   UNVERIFIED  POST /v1/projects request/response shape
//   UNVERIFIED  the project status vocabulary (see statusMap.ts)
//   UNVERIFIED  the transcript/word update endpoint and word shape
//   UNVERIFIED  the export endpoint
//   UNVERIFIED  whether webhooks are signed at all (see SubmagicWebhook.ts)

export interface SubmagicErrorBody {
  error?: string;
  message?: string;
}

export interface SubmagicTemplatesResponse {
  templates: string[];
}

export interface SubmagicLanguage {
  name: string;
  code: string;
}

export interface SubmagicLanguagesResponse {
  languages: SubmagicLanguage[];
}

/**
 * POST /v1/projects request body.
 *
 * autoRender is ALWAYS false for us (§10/§12): the user edits captions before
 * we pay for a final render. The overlap features (magicBrolls, removeBadTakes,
 * cleanAudio, magicZooms) are all explicitly false by default because Clipiro
 * already owns B-roll, silence trimming and energy-reactive zoom, and two
 * systems doing the same job to one clip produce worse output than either.
 */
export interface SubmagicCreateProjectRequest {
  title: string;
  language: string;
  videoUrl: string;
  templateName: string;
  captionPositionX?: number;
  captionPositionY?: number;
  magicZooms: boolean;
  magicBrolls: boolean;
  removeBadTakes: boolean;
  cleanAudio: boolean;
  hookTitle: boolean | string;
  autoRender: boolean;
  webhookUrl?: string;
  dictionary?: string[];
}

/** UNVERIFIED shape — every field optional, nothing is trusted without a re-read. */
export interface SubmagicProject {
  id?: string;
  status?: string;
  title?: string;
  language?: string;
  downloadUrl?: string;
  outputUrl?: string;
  videoUrl?: string;
  duration?: number;
  durationSeconds?: number;
  words?: SubmagicWord[];
  transcript?: { words?: SubmagicWord[] };
  error?: string;
  errorMessage?: string;
}

/** UNVERIFIED — normalized defensively in words.ts. */
export interface SubmagicWord {
  id?: string;
  text?: string;
  word?: string;
  type?: string;
  startTime?: number;
  endTime?: number;
  start?: number;
  end?: number;
}

/**
 * Webhook payload. Only the project id is ever trusted from this — the worker
 * re-reads GET /v1/projects/{id} before acting, exactly like the ElevenLabs
 * route does with dubbing_id.
 */
export interface SubmagicWebhookPayload {
  projectId?: string;
  id?: string;
  status?: string;
  event?: string;
  [k: string]: unknown;
}

/** Parsed from x-ratelimit-* response headers (verified to exist). */
export interface SubmagicRateLimitSnapshot {
  limit: number | null;
  remaining: number | null;
  /** Unix seconds. */
  resetAt: number | null;
}
