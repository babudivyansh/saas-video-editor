import { z } from "zod";

// Validates env vars once, at server startup (see instrumentation.ts), so a
// misconfigured deploy fails fast with a clear message instead of crashing
// deep inside whichever request handler first hits a non-null assertion.
// Vars that gate an optional feature (AI providers, stock-content panels,
// etc.) stay optional here too — those already degrade gracefully at the
// call site ("not configured" UI, feature disabled) rather than needing the
// whole server to refuse to boot.

// NODE_ENV is deliberately not in this schema (and not on `env`) — Next.js
// sets it automatically, it's never user-configured, and treating it as an
// app secret would be framework-internal noise in a schema meant to catch
// deployment misconfiguration. Call sites keep reading it as `process.env.NODE_ENV`.
const schema = z.object({
  // Foundational — nothing works without these.
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),

  // Core product surface — uploads and billing are load-bearing everywhere.
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required (uploads/rendering store to S3)"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required (uploads/rendering store to S3)"),
  AWS_S3_BUCKET: z.string().min(1, "AWS_S3_BUCKET is required (uploads/rendering store to S3)"),
  AWS_REGION: z.string().default("us-east-1"),
  RAZORPAY_KEY_ID: z.string().min(1, "RAZORPAY_KEY_ID is required (billing)"),
  RAZORPAY_KEY_SECRET: z.string().min(1, "RAZORPAY_KEY_SECRET is required (billing)"),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1, "RAZORPAY_WEBHOOK_SECRET is required (billing webhook verification)"),

  // Infra — optional, each already has an in-memory/local fallback. When set
  // it must actually parse as a connection URL: `new Redis(env.REDIS_URL)`
  // throws at import time otherwise, which surfaces as a cryptic "Invalid URL"
  // deep in the build instead of this schema's clear boot error (live incident:
  // the Upstash dashboard's redis-cli snippet pasted in as the value).
  REDIS_URL: z
    .string()
    .refine((v) => {
      try {
        const proto = new URL(v).protocol;
        return proto === "redis:" || proto === "rediss:";
      } catch {
        return false;
      }
    }, "REDIS_URL must be a redis:// or rediss:// connection URL (e.g. rediss://default:TOKEN@host:6379), not a redis-cli command")
    .optional(),

  // Cron auth — optional at the schema level (missing means the routes stay
  // fail-closed 401, not open; see app/api/cron/*).
  CRON_SECRET: z.string().optional(),
  SOCIAL_REFRESH_SECRET: z.string().optional(),
  ASSET_CLEANUP_SECRET: z.string().optional(),

  // CDN prep seam for the asset bucket (app/dashboard/assets). Unset by
  // default — asset reads fall back to S3 presigned URLs. Once a CloudFront
  // distribution (with an Origin Access Control on the bucket) is
  // provisioned, set this to its domain to serve assets through it instead.
  // NOTE: this alone does not make CloudFront enforce the same per-request
  // expiry/ownership check a presigned S3 URL does — a signed-URL/signed-
  // cookie key group on the distribution is a separate, later step.
  CDN_BASE_URL: z.string().optional(),

  // Render queue driver — optional, defaults to in-process.
  RENDER_QUEUE_DRIVER: z.string().optional(),

  // Observability — optional, Sentry disables itself when unset.
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Optional AI/feature providers — each already shows a "not configured"
  // state at the call site when unset.
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_GEMINI_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  // Fallback speech-to-text provider (lib/transcription.ts) — used only when
  // ElevenLabs Scribe's own retries are exhausted, so transcription (feeding
  // both clip selection and captions) isn't a single-vendor point of failure.
  // Unset = fallback is a no-op, existing ElevenLabs-only behavior unchanged.
  OPENAI_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  JAMENDO_CLIENT_ID: z.string().optional(),
  GIPHY_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // Preset avatar assets for the AI-creator tool — public S3 URLs, feature
  // degrades to "upload your own face" when unset.
  PRESET_AVATAR_NANO_BANANA_URL: z.string().optional(),
  PRESET_AVATAR_FACE_SWAP_URL: z.string().optional(),

  // Social-account OAuth token encryption (lib/encryption.ts). Required in
  // production; falls back to a JWT_SECRET-derived key in dev.
  SOCIAL_TOKEN_KEY: z.string().optional(),
  // Meta (Facebook/Instagram) OAuth — social account linking.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  // TikTok Display API OAuth — social account linking. The TikTok connect card
  // only appears once these are set (requires an approved TikTok developer app).
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  // Competitor tracking public-data vendor (pay-as-you-go). Feature is hidden
  // until the key is set; the monthly budget hard-caps vendor spend.
  SCRAPECREATORS_API_KEY: z.string().optional(),
  SOCIAL_COMPETITOR_MONTHLY_BUDGET: z.string().optional(), // vendor requests/month, default 300
  // Self-contained BullMQ scheduler for social-account refresh — off by
  // default; see lib/social/refresh-queue.ts.
  SOCIAL_REFRESH_DRIVER: z.string().optional(),
  SOCIAL_REFRESH_INTERVAL_MIN: z.string().optional(),
  // Render worker concurrency — defaults to 2 (lib/render-queue.ts).
  RENDER_CONCURRENCY: z.string().optional(),

  // Custom/cloned ElevenLabs voice IDs — each falls back to a stock voice
  // when unset (utils/voice-ids.ts).
  ELEVENLABS_VOICE_WILLIAM: z.string().optional(),
  ELEVENLABS_VOICE_ADAM: z.string().optional(),
  ELEVENLABS_VOICE_DANDAN: z.string().optional(),
  ELEVENLABS_VOICE_CHARLIE: z.string().optional(),
  ELEVENLABS_VOICE_CLYDE: z.string().optional(),
  ELEVENLABS_VOICE_DANIEL: z.string().optional(),
  ELEVENLABS_VOICE_DAVE: z.string().optional(),
  ELEVENLABS_VOICE_ETHAN: z.string().optional(),
  ELEVENLABS_VOICE_FIN: z.string().optional(),
  ELEVENLABS_VOICE_HARRY: z.string().optional(),
  ELEVENLABS_VOICE_JOSH: z.string().optional(),
  ELEVENLABS_VOICE_LIAM: z.string().optional(),
  ELEVENLABS_VOICE_MATTHEW: z.string().optional(),
  ELEVENLABS_VOICE_PATRICK: z.string().optional(),
  ELEVENLABS_VOICE_SAM: z.string().optional(),
  ELEVENLABS_VOICE_THOMAS: z.string().optional(),
  ELEVENLABS_VOICE_NATASHA: z.string().optional(),
  ELEVENLABS_VOICE_ALICE: z.string().optional(),
  ELEVENLABS_VOICE_ARIA: z.string().optional(),
  ELEVENLABS_VOICE_BELLA: z.string().optional(),
  ELEVENLABS_VOICE_CHARLOTTE: z.string().optional(),
  ELEVENLABS_VOICE_ELLI: z.string().optional(),
  ELEVENLABS_VOICE_EMILY: z.string().optional(),
  ELEVENLABS_VOICE_FREYA: z.string().optional(),
  ELEVENLABS_VOICE_GRACE: z.string().optional(),
  ELEVENLABS_VOICE_MATILDA: z.string().optional(),
  ELEVENLABS_VOICE_RACHEL: z.string().optional(),
  ELEVENLABS_VOICE_SARAH: z.string().optional(),
  ELEVENLABS_VOICE_SERENA: z.string().optional(),
  ELEVENLABS_VOICE_AMIR1: z.string().optional(),
  ELEVENLABS_VOICE_AMIR2: z.string().optional(),
  ELEVENLABS_VOICE_SPONGEBOB: z.string().optional(),

  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_BACKGROUNDS_BASE: z.string().optional(),
  NEXT_PUBLIC_MUSIC_BASE: z.string().optional(),
  NEXT_PUBLIC_DISCORD_INVITE_URL: z.string().optional(),
});

export function validateEnv(): void {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
}

/**
 * Every validated var as a typed property, so call sites read `env.X`
 * instead of scattering raw `process.env.X` (and a typo'd var name is a
 * TypeScript error instead of a silent `undefined`). Parsed eagerly at
 * import time with the same schema `validateEnv()` uses — in the running
 * server this is a no-op re-check (instrumentation.ts already called
 * `validateEnv()` at boot), so it throws the same descriptive error, just
 * the moment something imports this module rather than only at boot.
 *
 * A var read via `process.env.X` that ISN'T in `schema` above is either dead
 * code or a schema gap — add it to the schema (required or `.optional()`)
 * rather than reading around this file.
 */
export const env: z.infer<typeof schema> = schema.parse(process.env);
