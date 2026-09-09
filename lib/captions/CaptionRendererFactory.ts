// Decides which renderer a template actually gets, and degrades instead of
// failing.
//
// This is the only place the fallback policy lives (§31). Every gate below
// answers the same question — "can we responsibly spend money on this render
// right now?" — and a "no" from any of them returns the native renderer rather
// than throwing. The user loses the animation, not the export.
//
// Modelled on resolveRenderTarget() in lib/render-target.ts, which makes the
// identical CPU-vs-GPU decision and, per its own doc comment, never throws.

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { isFeatureEnabled } from "@/lib/flags";
import type { CaptionTemplate } from "@/lib/caption-templates";
import type { CaptionRenderer } from "./CaptionRenderer";
import type { CaptionFeatureToggles } from "./types";
import { nativeCaptionRenderer } from "./providers/native/NativeCaptionRenderer";
import { submagicAdapter } from "./providers/submagic/SubmagicAdapter";
import { isBreakerOpen, isSubmagicConfigured } from "./providers/submagic/SubmagicClient";

// ── Routing policy ──────────────────────────────────────────────────────────
// Config-KV with defaults in code, same shape as GPU_ROUTING_DEFAULTS. Editable
// from admin with no deploy.

export interface SubmagicRouting {
  enabled: boolean;
  /** Tier slugs allowed to use the paid renderer. Empty = everyone. */
  tiers: string[];
  /** Below this, the provider's per-minute rounding makes it poor value. */
  minClipSec: number;
  /** Above this we refuse rather than risk a large surprise bill. */
  maxClipSec: number;
}

export const SUBMAGIC_ROUTING_DEFAULTS: SubmagicRouting = {
  enabled: true,
  tiers: ["creator", "pro", "studio"],
  minClipSec: 3,
  maxClipSec: 300,
};

export async function getSubmagicRouting(): Promise<SubmagicRouting> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "submagic_routing" } });
    if (!row) return SUBMAGIC_ROUTING_DEFAULTS;
    return { ...SUBMAGIC_ROUTING_DEFAULTS, ...(JSON.parse(row.value) as Partial<SubmagicRouting>) };
  } catch {
    return SUBMAGIC_ROUTING_DEFAULTS;
  }
}

// ── Feature toggles ─────────────────────────────────────────────────────────

/**
 * Reads the provider effect flags (§30).
 *
 * Defaults match the spec's MVP posture: captions and hooks on, everything that
 * overlaps a Clipiro-owned feature off. `isFeatureEnabled` is DB-backed and
 * admin-editable, so these flip without a redeploy.
 */
export async function getProviderFeatureToggles(): Promise<CaptionFeatureToggles> {
  const [autoZoom, broll, cleanAudio] = await Promise.all([
    isFeatureEnabled("submagic_auto_zoom", false),
    isFeatureEnabled("submagic_broll", false),
    isFeatureEnabled("submagic_clean_audio", false),
  ]);
  return { autoZoom, broll, cleanAudio, removeBadTakes: false };
}

export async function areHooksEnabled(): Promise<boolean> {
  return isFeatureEnabled("submagic_hooks", true);
}

// ── The decision ────────────────────────────────────────────────────────────

export interface RendererDecision {
  renderer: CaptionRenderer;
  /** Set when we wanted the paid renderer but fell back. For logging/UX. */
  fallbackReason?: string;
}

export interface RendererContext {
  tier?: string;
  clipDurationSec?: number;
}

/**
 * Never throws. Returns the native renderer for any reason the paid one can't
 * be used, with `fallbackReason` explaining which gate closed.
 */
export async function getCaptionRenderer(
  template: CaptionTemplate | null,
  ctx: RendererContext = {},
): Promise<RendererDecision> {
  const fall = (reason: string): RendererDecision => ({ renderer: nativeCaptionRenderer, fallbackReason: reason });

  if (!template) return fall("unknown template");
  if ((template.provider ?? "native") === "native") return { renderer: nativeCaptionRenderer };
  if (template.active === false) return fall("template disabled");
  if (template.provider !== "submagic") return fall(`unsupported provider "${template.provider}"`);

  if (!isSubmagicConfigured()) return fall("provider not configured");

  // Two flags on purpose: submagic_enabled is the whole-integration kill
  // switch, submagic_captions scopes it to this feature, so captions can be
  // disabled without taking down anything else built on the adapter later.
  const [enabled, captionsOn] = await Promise.all([
    isFeatureEnabled("submagic_enabled", true),
    isFeatureEnabled("submagic_captions", true),
  ]);
  if (!enabled) return fall("provider disabled by feature flag");
  if (!captionsOn) return fall("premium captions disabled by feature flag");

  const routing = await getSubmagicRouting();
  if (!routing.enabled) return fall("provider disabled by routing config");

  if (routing.tiers.length > 0 && ctx.tier && !routing.tiers.includes(ctx.tier)) {
    return fall(`tier "${ctx.tier}" not eligible`);
  }

  const dur = ctx.clipDurationSec;
  if (typeof dur === "number") {
    if (dur < routing.minClipSec) return fall(`clip shorter than ${routing.minClipSec}s`);
    if (dur > routing.maxClipSec) return fall(`clip longer than ${routing.maxClipSec}s`);
  }

  if (await isBreakerOpen()) {
    logger.warn("captions", "submagic breaker open — falling back to native captions");
    return fall("provider circuit breaker open");
  }

  return { renderer: submagicAdapter };
}

/** Looks a renderer up by its stored id, for workers resuming an existing job. */
export function getRendererById(id: string): CaptionRenderer {
  return id === "submagic" ? submagicAdapter : nativeCaptionRenderer;
}

/** Admin ops health, shaped like gpuHealth(). Never throws. */
export async function captionProviderHealth() {
  try {
    return { submagic: await submagicAdapter.health() };
  } catch {
    return { submagic: { configured: isSubmagicConfigured(), reachable: false, breakerOpen: false } };
  }
}

/** Exposed for the sweep, which wants to know whether Redis-backed state is live. */
export async function redisReachable(): Promise<boolean> {
  try {
    await redis.get("submagic:breaker");
    return true;
  } catch {
    return false;
  }
}
