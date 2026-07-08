import { z } from "zod";

// Validates env vars once, at server startup (see instrumentation.ts), so a
// misconfigured deploy fails fast with a clear message instead of crashing
// deep inside whichever request handler first hits a non-null assertion.
// Vars that gate an optional feature (AI providers, stock-content panels,
// etc.) stay optional here too — those already degrade gracefully at the
// call site ("not configured" UI, feature disabled) rather than needing the
// whole server to refuse to boot.

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

  // Infra — optional, each already has an in-memory/local fallback.
  REDIS_URL: z.string().optional(),

  // Cron auth — optional at the schema level (missing means the routes stay
  // fail-closed 401, not open; see app/api/cron/*).
  CRON_SECRET: z.string().optional(),
  SOCIAL_REFRESH_SECRET: z.string().optional(),

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
  ELEVENLABS_API_KEY: z.string().optional(),
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

  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_BACKGROUNDS_BASE: z.string().optional(),
  NEXT_PUBLIC_DISCORD_INVITE_URL: z.string().optional(),
});

export function validateEnv(): void {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
}
