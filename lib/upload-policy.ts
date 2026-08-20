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
// reference images once adopted).
import { getUserTier } from "@/lib/auth";
import {
  type TierId,
  TIER_LABEL,
  maxUploadBytesForTier,
  ALLOWED_UPLOAD_MIME,
  formatBytes,
} from "@/lib/plans/tiers";

// One entry per app/api/tools/* route (plus "reference-image" for the shared
// video-generator reference-image upload) that accepts a user-supplied file
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
  | "cut-and-crop"
  | "reference-image"
  | "ai-creator";

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
  "reference-image": "Reference image upload",
  "ai-creator": "AI Creator",
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
  "reference-image": 10 * 1024 * 1024,
  "ai-creator": 200 * 1024 * 1024,
};

// No verified provider-documented max upload size exists in this codebase
// for any of these features today (audit §13) — this map is the deliberate
// extension point for when one is confirmed against a provider's real docs.
// Left empty on purpose: DO NOT populate with a guessed number.
export const PROVIDER_TECHNICAL_MAX_BYTES: Partial<Record<UploadFeature, number>> = {};

export type UploadLimitingFactor = "plan" | "feature" | "provider" | "storage";

export interface UploadPolicy {
  /** null when no authenticated user is available (an anonymous-callable free tool) — see resolveUploadPolicy. */
  tier: TierId | null;
  planLabel: string;
  /** Undefined when there's no signed-in user to resolve a plan for. */
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
 * requirement on the route itself) — in that case only the feature's
 * technical cap applies, since there is no plan to resolve.
 */
export async function resolveUploadPolicy(userId: string | null, feature: UploadFeature): Promise<UploadPolicy> {
  const featureMaxBytes = FEATURE_TECHNICAL_MAX_BYTES[feature];
  const providerMaxBytes = PROVIDER_TECHNICAL_MAX_BYTES[feature];

  const tier = userId ? await getUserTier(userId) : null;
  const planMaxBytes = tier ? maxUploadBytesForTier(tier) : undefined;

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
