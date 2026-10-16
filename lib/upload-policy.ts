// Shared upload-entitlement resolver for routes that accept user media but
// sit OUTSIDE the Global Asset Library (lib/asset-service.ts) — the AI/
// utility tool routes under app/api/tools/* whose input file is ephemeral
// processing input, never persisted as an Asset. Those routes previously
// each hardcoded their own flat MAX_BYTES constant, identical for every
// subscription tier (Upload Limits Audit, §11/§18) — this module lets them
// resolve the same per-tier plan cap the Asset Library already enforces
// (lib/plans/tiers.ts), combined with the feature's own technical ceiling.
//
// effectiveMaxBytes = min(planMaxBytes, featureMaxBytes, providerMaxBytes),
// ignoring any term that doesn't apply to a given feature. The Asset
// Library's own assertFileSizeAllowed/assertUnderStorageQuota (asset-service.ts)
// are untouched by this module — they remain the authority for anything that
// becomes a persisted Asset (uploads, multipart, URL import, avatars,
// stock re-hosts).
import { NextResponse, type NextRequest } from "next/server";
import { getUserTier, requireAdmin } from "@/lib/auth";
import {
  type TierId,
  TIER_LABEL,
  maxUploadBytesForTier,
  ALLOWED_UPLOAD_MIME,
  formatBytes,
} from "@/lib/plans/tiers";

// One entry per app/api/tools/* route that accepts a user-supplied file
// outside the Asset Library. Values preserve the exact per-route constants
// found in the audit — none are a documented upstream-provider limit (no
// fal.ai/ElevenLabs max-input-size is confirmed anywhere in this codebase),
// so they read as Clipiro-authored technical/cost ceilings, not provider
// passthroughs. They still combine with the plan cap via min(), never
// replace it.
export type UploadFeature =
  | "face-swap"
  | "background-remover"
  | "subtitle-remover"
  | "voice-changer"
  | "vocal-remover"
  | "enhance-speech"
  | "audio-balancer"
  | "mp3-converter"
  | "video-compressor"
  | "cut-and-crop";

export const UPLOAD_FEATURE_LABEL: Record<UploadFeature, string> = {
  "face-swap": "Face Swap",
  "background-remover": "Background Remover",
  "subtitle-remover": "Subtitle Remover",
  "voice-changer": "Voice Changer",
  "vocal-remover": "Vocal Remover",
  "enhance-speech": "Enhance Speech",
  "audio-balancer": "Audio Balancer",
  "mp3-converter": "MP3 Converter",
  "video-compressor": "Video Compressor",
  "cut-and-crop": "Cut & Crop",
};

// The single source of truth for every feature-level technical ceiling —
// previously scattered as a local `MAX_BYTES`/`MAX_SIZE` constant per route
// file. Preserves today's exact values (audit §10); changing one of these is
// a deliberate product/technical decision, not something this migration
// should alter.
export const FEATURE_TECHNICAL_MAX_BYTES: Record<UploadFeature, number> = {
  "face-swap": 10 * 1024 * 1024, // per image
  "background-remover": 10 * 1024 * 1024,
  "subtitle-remover": 500 * 1024 * 1024,
  "voice-changer": 50 * 1024 * 1024,
  "vocal-remover": 50 * 1024 * 1024,
  "enhance-speech": 50 * 1024 * 1024,
  "audio-balancer": 500 * 1024 * 1024,
  "mp3-converter": 500 * 1024 * 1024,
  "video-compressor": 500 * 1024 * 1024,
  "cut-and-crop": 500 * 1024 * 1024,
};

// No verified provider-documented max upload size exists in this codebase
// for any of these features today (audit §13) — this map is the deliberate
// extension point for when one is confirmed against a provider's real docs.
// Left empty on purpose: DO NOT populate with a guessed number.
/**
 * Ceiling for a caller with NO session — the three free tools accept anonymous
 * requests. Their 500 MB feature ceilings were sized for signed-in plans, and
 * every byte of a multipart body is held in memory while it is parsed, so an
 * unauthenticated 500 MB upload per request (times a few IPs) was enough to
 * exhaust the host. Signed-in callers get their real plan cap instead.
 */
export const ANONYMOUS_MAX_BYTES = 100 * 1024 * 1024;

export const PROVIDER_TECHNICAL_MAX_BYTES: Partial<Record<UploadFeature, number>> = {};

export type UploadLimitingFactor = "plan" | "feature" | "provider" | "storage";

export interface UploadPolicy {
  /** null when no authenticated user is available (an anonymous-callable free tool) — see resolveUploadPolicy. */
  tier: TierId | null;
  planLabel: string;
  /** ANONYMOUS_MAX_BYTES when there's no signed-in user to resolve a plan for. */
  planMaxBytes: number | undefined;
  featureMaxBytes: number;
  providerMaxBytes: number | undefined;
  effectiveMaxBytes: number;
  limitingFactor: Exclude<UploadLimitingFactor, "storage">;
  allowedMime: RegExp;
  featureLabel: string;
}

function tierDisplayName(tier: TierId): string {
  return tier === "free" ? "Free" : TIER_LABEL[tier];
}

/**
 * Resolves the authoritative upload policy for a given feature, combining
 * the caller's subscription-plan cap (when authenticated) with the feature's
 * own technical ceiling: effectiveMaxBytes = min(planMaxBytes,
 * featureMaxBytes, providerMaxBytes), ignoring whichever terms don't apply.
 *
 * `userId` must come from a server-verified session (getAuthUser), never a
 * client-supplied value — this function always re-resolves tier from the
 * database via getUserTier, exactly like the Asset Library's own
 * assertFileSizeAllowed. Pass `null` only for the handful of routes that are
 * deliberately anonymous-callable (IP-rate-limited free tools with no login
 * requirement on the route itself) — in that case ANONYMOUS_MAX_BYTES stands
 * in for the plan cap, since there is no plan to resolve.
 */
export async function resolveUploadPolicy(userId: string | null, feature: UploadFeature): Promise<UploadPolicy> {
  const featureMaxBytes = FEATURE_TECHNICAL_MAX_BYTES[feature];
  const providerMaxBytes = PROVIDER_TECHNICAL_MAX_BYTES[feature];

  const tier = userId ? await getUserTier(userId) : null;
  const planMaxBytes = tier ? maxUploadBytesForTier(tier) : ANONYMOUS_MAX_BYTES;

  let effectiveMaxBytes = featureMaxBytes;
  let limitingFactor: Exclude<UploadLimitingFactor, "storage"> = "feature";
  if (planMaxBytes !== undefined && planMaxBytes < effectiveMaxBytes) {
    effectiveMaxBytes = planMaxBytes;
    limitingFactor = "plan";
  }
  if (providerMaxBytes !== undefined && providerMaxBytes < effectiveMaxBytes) {
    effectiveMaxBytes = providerMaxBytes;
    limitingFactor = "provider";
  }

  return {
    tier,
    planLabel: tier ? tierDisplayName(tier) : "Guest",
    planMaxBytes,
    featureMaxBytes,
    providerMaxBytes,
    effectiveMaxBytes,
    limitingFactor,
    allowedMime: ALLOWED_UPLOAD_MIME,
    featureLabel: UPLOAD_FEATURE_LABEL[feature],
  };
}

export class UploadPolicyError extends Error {
  constructor(
    public readonly limitingFactor: UploadLimitingFactor,
    public readonly limitBytes: number,
    public readonly actualBytes: number,
    public readonly tier: TierId | null,
    message: string,
  ) {
    super(message);
    this.name = "UploadPolicyError";
  }
}

/** HTTP status for a policy violation — 413 for any size ceiling, 402 for a
 * cumulative storage-quota exhaustion, mirroring asset-service.ts's
 * assetLimitStatus convention so both error shapes map identically. */
export function uploadPolicyErrorStatus(factor: UploadLimitingFactor): number {
  return factor === "storage" ? 402 : 413;
}

// Upgrade messaging rule (audit §20): only suggest an upgrade when the PLAN
// is what's actually binding. A feature/provider ceiling wouldn't be raised
// by upgrading, so suggesting that would be misleading.
function uploadPolicyMessage(
  actualBytes: number,
  limitBytes: number,
  tier: TierId | null,
  factor: UploadLimitingFactor,
  featureLabel: string,
): string {
  if (factor === "plan" && !tier) {
    return `This file is ${formatBytes(actualBytes)}. Sign in to upload files larger than ${formatBytes(limitBytes)}.`;
  }
  if (factor === "plan" && tier) {
    return `This file is ${formatBytes(actualBytes)}, but your ${tierDisplayName(tier)} plan supports files up to ${formatBytes(limitBytes)}. Upgrade to upload larger files.`;
  }
  if (factor === "storage") {
    return `Storage limit reached (${formatBytes(limitBytes)} on your plan). Delete files or upgrade to upload more.`;
  }
  // feature or provider ceiling — never suggest an upgrade, it wouldn't help.
  return `${featureLabel} accepts files up to ${formatBytes(limitBytes)}. This file is ${formatBytes(actualBytes)}.`;
}

/** Throws UploadPolicyError if actualBytes exceeds the resolved policy's effectiveMaxBytes. */
export function assertWithinUploadPolicy(policy: UploadPolicy, actualBytes: number): void {
  if (actualBytes > policy.effectiveMaxBytes) {
    throw new UploadPolicyError(
      policy.limitingFactor,
      policy.effectiveMaxBytes,
      actualBytes,
      policy.tier,
      uploadPolicyMessage(actualBytes, policy.effectiveMaxBytes, policy.tier, policy.limitingFactor, policy.featureLabel),
    );
  }
}

/** Structured JSON body for a rejected upload — enough for the UI to explain
 * actual size, effective max, plan, feature max, and the limiting factor
 * (spec #19), without exposing internals. */
export function uploadPolicyErrorBody(e: UploadPolicyError, policy: UploadPolicy) {
  return {
    error: e.message,
    limitBytes: e.limitBytes,
    actualBytes: e.actualBytes,
    limitingFactor: e.limitingFactor,
    plan: policy.planLabel,
    planMaxBytes: policy.planMaxBytes,
    featureMaxBytes: policy.featureMaxBytes,
  };
}

// Same upgrade rule as uploadPolicyMessage, minus the actual size: the body
// was refused before any file in it could be measured.
function bodyTooLargeMessage(policy: UploadPolicy): string {
  const max = formatBytes(policy.effectiveMaxBytes);
  if (policy.limitingFactor === "plan" && !policy.tier) return `Sign in to upload files larger than ${max}.`;
  if (policy.limitingFactor === "plan" && policy.tier) {
    return `Your ${tierDisplayName(policy.tier)} plan supports files up to ${max}. Upgrade to upload larger files.`;
  }
  return `${policy.featureLabel} accepts files up to ${max}.`;
}

/** Room for multipart boundaries, headers and the small text fields that ride
 * along with the file(s). */
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/**
 * Parse a tool route's multipart body, refusing it BEFORE it is buffered when
 * it cannot possibly fit the policy. Returns the FormData, or a 413/400
 * response for the route to return as-is.
 *
 * `req.formData()` holds the whole body in memory, and the per-file
 * assertWithinUploadPolicy check can only run after it — so every size limit
 * used to be enforced after the bytes were already in RAM, up to the 500 MB
 * proxy ceiling, on routes that anonymous callers can reach. A declared
 * Content-Length over the limit is now rejected without reading the body; a
 * body with no Content-Length (chunked) is counted as it streams in and cut
 * off the moment it passes the limit.
 *
 * `maxFiles` sizes the limit for routes that take several files per request
 * (each still checked individually afterwards).
 */
export async function readUploadForm(
  req: NextRequest,
  policy: UploadPolicy,
  maxFiles = 1,
): Promise<FormData | NextResponse> {
  return readMultipartWithin(req, policy.effectiveMaxBytes * maxFiles + MULTIPART_OVERHEAD_BYTES, () => ({
    error: bodyTooLargeMessage(policy),
    limitBytes: policy.effectiveMaxBytes,
    limitingFactor: policy.limitingFactor,
    plan: policy.planLabel,
    planMaxBytes: policy.planMaxBytes,
    featureMaxBytes: policy.featureMaxBytes,
  }));
}

/**
 * The size-bounded multipart reader behind readUploadForm, for upload routes
 * whose limit is not an UploadPolicy (the Asset Library's /api/upload).
 *
 * Every caller is excluded from proxy.ts's matcher (Next would otherwise
 * buffer the whole body for the proxy before any of this runs — see the
 * matcher there), so the proxy's maintenance gate runs here instead.
 */
export async function readMultipartWithin(
  req: NextRequest,
  limit: number,
  tooLargeBody: () => Record<string, unknown>,
): Promise<FormData | NextResponse> {
  const { getMaintenanceModeCached } = await import("@/lib/flags");
  const maint = await getMaintenanceModeCached().catch(() => ({ on: false, message: undefined }));
  if (maint.on && !(await requireAdmin(req).catch(() => null))) {
    return NextResponse.json(
      { error: maint.message || "Clipiro is briefly down for maintenance — back shortly.", maintenance: true },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const tooLarge = () => NextResponse.json(tooLargeBody(), { status: 413 });

  const declared = req.headers.get("content-length");
  try {
    if (declared !== null) {
      if (Number(declared) > limit) return tooLarge();
      return await req.formData();
    }
    if (!req.body) return await req.formData();

    // No declared length: count the bytes ourselves and stop at the limit.
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        return tooLarge();
      }
      chunks.push(value);
    }
    return await new Response(new Blob(chunks as BlobPart[]), {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }
}
