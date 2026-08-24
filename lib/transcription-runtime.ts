// Transcription runtime health: is caption generation actually able to work
// right now, and can we know that BEFORE charging a user for it?
//
// This exists because of the P0-2 pattern: production depended on a capability
// (the ffmpeg `drawtext` filter) that nothing verified until a paying user
// invoked it, and every invocation failed. Caption generation has the same
// shape — a provider credential that is absent or obviously wrong is
// discoverable without contacting anyone, yet today the request charges a
// credit, downloads the media, extracts audio, calls the provider, fails, and
// refunds. That is a guaranteed-failure sale plus wasted work.
//
// Two deliberately separate mechanisms:
//
//   1. `getTranscriptionRuntimeHealth()` — zero network, safe to call on every
//      request. Answers only "is this obviously unusable", so it can gate the
//      caption API before `spendCredits`.
//   2. `probeProviderAuth()` — real authentication check against each
//      provider's cheapest identity endpoint. NOT transcription, not billable,
//      and never called from the request path — only from the admin
//      diagnostics route.
//
// Nothing here ever returns, logs, or embeds a credential value.

import { env } from "@/lib/env";

export const TRANSCRIPTION_RUNTIME_UNAVAILABLE = "TRANSCRIPTION_RUNTIME_UNAVAILABLE";

/**
 * User-facing text for an unusable transcription runtime. Says nothing about
 * providers, credentials or configuration — a misconfiguration is an
 * operational fault the user can neither diagnose nor act on.
 */
export const TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  "Caption generation is temporarily unavailable. Please try again shortly.";

export type ProviderName = "elevenlabs" | "openai" | "fal";

export interface ProviderConfigReport {
  name: ProviderName;
  /** A credential is present in the environment. */
  configured: boolean;
  /**
   * The credential is not *obviously* malformed. Deliberately permissive: a
   * false "invalid" here would refuse a working key, which is worse than
   * letting a doubtful one through to the provider. Only clear-cut problems
   * are flagged.
   */
  shapeValid: boolean;
  /** Why the shape was rejected. Describes the SHAPE, never the value. */
  shapeIssue: string | null;
}

/** UUID-shaped values are ElevenLabs *key IDs*, not API keys — the exact
 *  confusion that took production captions down. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_RE = /^(your|test|todo|changeme|xxx|placeholder|dummy|example)/i;

function inspect(name: ProviderName, raw: string | undefined): ProviderConfigReport {
  if (!raw || raw.trim() === "") {
    return { name, configured: false, shapeValid: false, shapeIssue: null };
  }
  const value = raw.trim();
  const reject = (shapeIssue: string): ProviderConfigReport =>
    ({ name, configured: true, shapeValid: false, shapeIssue });

  if (value !== raw) return reject("has leading/trailing whitespace");
  if (PLACEHOLDER_RE.test(value)) return reject("looks like a placeholder, not a real credential");

  switch (name) {
    case "elevenlabs":
      // An ElevenLabs API key is an opaque token (historically 32 hex chars,
      // currently `sk_` + hex). A UUID is a key *identifier* from the API-keys
      // dashboard — it authenticates nothing.
      if (UUID_RE.test(value)) return reject("is a UUID — that is an ElevenLabs key ID, not an API key");
      if (value.length < 24) return reject("is too short to be an ElevenLabs API key");
      return { name, configured: true, shapeValid: true, shapeIssue: null };
    case "openai":
      if (!value.startsWith("sk-")) return reject("does not start with the expected OpenAI 'sk-' prefix");
      if (value.length < 24) return reject("is too short to be an OpenAI API key");
      return { name, configured: true, shapeValid: true, shapeIssue: null };
    case "fal":
      // fal credentials are "<key-id>:<key-secret>".
      if (!value.includes(":")) return reject("is missing the expected 'key-id:key-secret' separator");
      if (value.length < 24) return reject("is too short to be a fal credential");
      return { name, configured: true, shapeValid: true, shapeIssue: null };
  }
}

/**
 * Provider configuration, in the same priority order lib/transcription.ts
 * attempts them. Never includes credential values.
 */
export function describeProviders(): ProviderConfigReport[] {
  return [
    inspect("elevenlabs", env.ELEVENLABS_API_KEY),
    inspect("openai", env.OPENAI_API_KEY),
    inspect("fal", env.FAL_KEY),
  ];
}

export interface TranscriptionRuntimeHealth {
  ok: boolean;
  providers: ProviderConfigReport[];
  /** Machine-readable reason when !ok. */
  reason: "no_provider_configured" | "all_providers_malformed" | null;
}

/**
 * Cheap, network-free check used to gate caption generation before a credit
 * is spent.
 *
 * Refuses in exactly two cases, both unambiguous:
 *   • nothing is configured at all;
 *   • everything configured is obviously malformed.
 *
 * It deliberately does NOT try to predict whether a well-formed credential
 * will authenticate — that requires the provider, and guessing wrong would
 * block working setups. A well-formed-but-rejected key still fails downstream
 * and is refunded, exactly as before.
 */
export function getTranscriptionRuntimeHealth(): TranscriptionRuntimeHealth {
  const providers = describeProviders();
  const configured = providers.filter((p) => p.configured);
  if (configured.length === 0) {
    return { ok: false, providers, reason: "no_provider_configured" };
  }
  if (configured.every((p) => !p.shapeValid)) {
    return { ok: false, providers, reason: "all_providers_malformed" };
  }
  return { ok: true, providers, reason: null };
}

export interface ProviderAuthResult {
  name: ProviderName;
  attempted: boolean;
  ok: boolean;
  /** HTTP status where one was received — safe to surface to an admin. */
  status: number | null;
  detail: string;
}

/**
 * Real authentication check per provider, using each one's cheapest identity
 * endpoint — never a transcription call, so this cannot incur usage charges.
 *
 * Admin-diagnostics only. Not for the request path.
 */
export async function probeProviderAuth(timeoutMs = 15_000): Promise<ProviderAuthResult[]> {
  const results: ProviderAuthResult[] = [];
  const withTimeout = async (fn: (signal: AbortSignal) => Promise<Response>) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fn(ac.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  // ── ElevenLabs: GET /v1/user is free and identity-only.
  if (env.ELEVENLABS_API_KEY) {
    try {
      const res = await withTimeout((signal) =>
        fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": env.ELEVENLABS_API_KEY! }, signal }));
      results.push({
        name: "elevenlabs",
        attempted: true,
        ok: res.ok,
        status: res.status,
        detail: res.ok ? "authenticated" : `rejected with HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({ name: "elevenlabs", attempted: true, ok: false, status: null, detail: `network error: ${e instanceof Error ? e.message : String(e)}` });
    }
  } else {
    results.push({ name: "elevenlabs", attempted: false, ok: false, status: null, detail: "not configured" });
  }

  // ── OpenAI: GET /v1/models is free and identity-only.
  if (env.OPENAI_API_KEY) {
    try {
      const res = await withTimeout((signal) =>
        fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY!}` }, signal }));
      results.push({
        name: "openai",
        attempted: true,
        ok: res.ok,
        status: res.status,
        detail: res.ok ? "authenticated" : `rejected with HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({ name: "openai", attempted: true, ok: false, status: null, detail: `network error: ${e instanceof Error ? e.message : String(e)}` });
    }
  } else {
    results.push({ name: "openai", attempted: false, ok: false, status: null, detail: "not configured" });
  }

  // ── fal: no documented free identity endpoint. Deliberately NOT probed —
  // every fal entry point queues billable work, and a diagnostic must never
  // spend the user's money to answer a question about configuration.
  results.push({
    name: "fal",
    attempted: false,
    ok: false,
    status: null,
    detail: env.FAL_KEY
      ? "configured — not probed (no free identity endpoint; probing would queue billable work)"
      : "not configured",
  });

  return results;
}
