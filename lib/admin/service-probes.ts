import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { s3 } from "@/utils/s3-upload";
import { gpuHealth } from "@/lib/gpu-service";
import { captionProviderHealth } from "@/lib/captions/CaptionRendererFactory";

// "Is this outside account working?" for every provider the app depends on,
// for the admin Services tab. Each probe uses the provider's cheapest
// identity/read endpoint — never one that queues billable work — and runs only
// when an admin presses Test.
//
// Nothing secret ever leaves here: results carry configured/ok/latency and a
// short human detail built from status codes and public metadata, never a key,
// a request header, or a raw provider error body (which can echo input).

export type ServiceCategory = "core" | "billing" | "email" | "ai" | "media" | "social" | "monitoring";

export interface ServiceStatus {
  id: string;
  label: string;
  category: ServiceCategory;
  /** What the app uses it for. */
  purpose: string;
  configured: boolean;
  /** Has a free check — false for providers where any call would be billable or a real send. */
  testable: boolean;
  /** null = not tested (not probe-able, not configured, or not run yet). */
  ok: boolean | null;
  latencyMs: number | null;
  detail: string;
  usage?: { used: number; limit: number; unit: string };
}

interface ServiceDef {
  id: string;
  label: string;
  category: ServiceCategory;
  purpose: string;
  configured: () => boolean;
  /** Absent: "configured" is all we can honestly say without spending money. */
  probe?: (signal: AbortSignal) => Promise<Pick<ServiceStatus, "ok" | "detail" | "usage">>;
  untestedDetail?: string;
}

const TIMEOUT_MS = 6000;

async function httpProbe(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  describe?: (json: unknown) => Pick<ServiceStatus, "detail" | "usage">,
): Promise<Pick<ServiceStatus, "ok" | "detail" | "usage">> {
  const res = await fetch(url, { ...init, signal, cache: "no-store" });
  if (!res.ok) {
    return {
      ok: false,
      detail: res.status === 401 || res.status === 403 ? `key rejected (HTTP ${res.status})` : `HTTP ${res.status}`,
    };
  }
  if (!describe) return { ok: true, detail: "authenticated" };
  const json = await res.json().catch(() => null);
  return { ok: true, ...describe(json) };
}

const SERVICES: ServiceDef[] = [
  {
    id: "database",
    label: "Database (Postgres)",
    category: "core",
    purpose: "All app data",
    configured: () => !!env.DATABASE_URL,
    probe: async () => {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, detail: "query OK" };
    },
  },
  {
    id: "redis",
    label: "Redis",
    category: "core",
    purpose: "Sessions, rate limits, queues, cron tracking",
    configured: () => !!env.REDIS_URL,
    probe: async () => {
      const ok = await redis.ping();
      return { ok, detail: ok ? "PING OK" : "unreachable (running on the in-memory fallback)" };
    },
  },
  {
    id: "s3",
    label: "S3 storage",
    category: "core",
    purpose: "Uploads, renders, library assets",
    configured: () => !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_S3_BUCKET),
    probe: async (signal) => {
      await s3.send(new HeadBucketCommand({ Bucket: env.AWS_S3_BUCKET }), { abortSignal: signal });
      return { ok: true, detail: `bucket reachable (${env.AWS_REGION ?? "default region"})` };
    },
  },
  {
    id: "razorpay",
    label: "Razorpay",
    category: "billing",
    purpose: "Payments, subscriptions, refunds",
    configured: () => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
    probe: (signal) =>
      httpProbe(
        "https://api.razorpay.com/v1/plans?count=1",
        { headers: { Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}` } },
        signal,
        () => ({ detail: `authenticated · ${env.RAZORPAY_KEY_ID.startsWith("rzp_live_") ? "LIVE mode" : "TEST mode"}` }),
      ),
  },
  {
    id: "resend",
    label: "Resend (email)",
    category: "email",
    purpose: "Transactional + lifecycle email",
    configured: () => !!env.RESEND_API_KEY,
    probe: (signal) =>
      httpProbe("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } }, signal, (json) => {
        const domains = ((json as { data?: Array<{ name?: string; status?: string }> })?.data ?? []).map((d) => `${d.name} (${d.status})`);
        return { detail: domains.length ? `domains: ${domains.join(", ")}` : "authenticated · no sending domains" };
      }),
  },
  {
    id: "smtp",
    label: "SMTP (fallback email)",
    category: "email",
    purpose: "Email when Resend is not configured",
    configured: () => !!(env.EMAIL_HOST && env.EMAIL_USER),
    untestedDetail: "configured — not tested (a test would need a real send)",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    category: "ai",
    purpose: "Voiceover, dubbing, transcription",
    configured: () => !!env.ELEVENLABS_API_KEY,
    probe: (signal) =>
      httpProbe("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": env.ELEVENLABS_API_KEY! } }, signal, (json) => {
        const sub = (json as { subscription?: { tier?: string; character_count?: number; character_limit?: number } })?.subscription;
        return {
          detail: `authenticated${sub?.tier ? ` · ${sub.tier} tier` : ""}`,
          ...(sub?.character_limit ? { usage: { used: sub.character_count ?? 0, limit: sub.character_limit, unit: "characters" } } : {}),
        };
      }),
  },
  {
    id: "openai",
    label: "OpenAI",
    category: "ai",
    purpose: "Transcription fallback",
    configured: () => !!env.OPENAI_API_KEY,
    probe: (signal) => httpProbe("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } }, signal),
  },
  {
    id: "gemini",
    label: "Google Gemini",
    category: "ai",
    purpose: "Clip picking, titles, AI text",
    configured: () => !!env.GEMINI_API_KEY,
    probe: (signal) =>
      httpProbe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": env.GEMINI_API_KEY! } }, signal),
  },
  {
    id: "fal",
    label: "fal.ai",
    category: "ai",
    purpose: "Image generation, OCR",
    configured: () => !!env.FAL_KEY,
    untestedDetail: "configured — not tested (fal has no free check; every call is billable)",
  },
  {
    id: "submagic",
    label: "Submagic",
    category: "media",
    purpose: "Premium caption rendering",
    configured: () => !!env.SUBMAGIC_API_KEY,
    probe: async () => {
      const { submagic } = await captionProviderHealth();
      if (submagic.breakerOpen) return { ok: false, detail: "circuit breaker open — recent calls failed" };
      return { ok: submagic.reachable, detail: submagic.reachable ? "reachable" : "unreachable" };
    },
  },
  {
    id: "gpu",
    label: "GPU media service",
    category: "media",
    purpose: "Speaker detection, NVENC renders",
    configured: () => !!env.GPU_SERVICE_URL,
    probe: async () => {
      const h = await gpuHealth();
      if (h.breakerOpen) return { ok: false, detail: "circuit breaker open — falling back to CPU" };
      return { ok: h.reachable, detail: h.reachable ? "health check OK" : "unreachable — renders fall back to CPU" };
    },
  },
  { id: "pexels", label: "Pexels", category: "media", purpose: "Stock footage", configured: () => !!env.PEXELS_API_KEY },
  { id: "jamendo", label: "Jamendo", category: "media", purpose: "Stock music", configured: () => !!env.JAMENDO_CLIENT_ID },
  { id: "giphy", label: "Giphy", category: "media", purpose: "GIF stickers", configured: () => !!env.GIPHY_API_KEY },
  {
    id: "scrapecreators",
    label: "ScrapeCreators",
    category: "social",
    purpose: "Competitor + TikTok data for Social Tracker",
    configured: () => !!env.SCRAPECREATORS_API_KEY,
    untestedDetail: "configured — not tested (no confirmed free endpoint)",
  },
  { id: "meta", label: "Meta (Instagram/Facebook)", category: "social", purpose: "Social account OAuth + publishing", configured: () => !!(env.META_APP_ID && env.META_APP_SECRET) },
  { id: "google-oauth", label: "Google sign-in", category: "social", purpose: "“Continue with Google”", configured: () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) },
  { id: "sentry", label: "Sentry", category: "monitoring", purpose: "Error reporting", configured: () => !!(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN) },
];

export const SERVICE_IDS = SERVICES.map((s) => s.id);

function base(s: ServiceDef): ServiceStatus {
  const configured = s.configured();
  return {
    id: s.id,
    label: s.label,
    category: s.category,
    purpose: s.purpose,
    configured,
    testable: !!s.probe,
    ok: null,
    latencyMs: null,
    detail: !configured ? "not configured" : s.probe ? "not tested yet" : (s.untestedDetail ?? "configured — no free check available"),
  };
}

/** Every service with its configured state only — no network calls. */
export function listServices(): ServiceStatus[] {
  return SERVICES.map(base);
}

/** Runs one service's probe (when it has one and is configured). */
export async function probeService(id: string): Promise<ServiceStatus | null> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) return null;
  const status = base(def);
  if (!status.configured || !def.probe) return status;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const r = await Promise.race([
      def.probe(ac.signal),
      new Promise<never>((_, reject) => ac.signal.addEventListener("abort", () => reject(new Error("timeout")))),
    ]);
    return { ...status, ...r, latencyMs: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.name === "AbortError" || e.message === "timeout" ? `no answer in ${TIMEOUT_MS / 1000}s` : e.name : "failed";
    // The error NAME only (e.g. "NoSuchBucket", "TypeError") — a message can
    // carry request detail, and this string is shown in the browser.
    return { ...status, ok: false, latencyMs: Date.now() - started, detail: `failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
