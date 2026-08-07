// Decides whether a given piece of work runs on the CPU (in-process ffmpeg) or
// on the GPU service.
//
// This deliberately lives BELOW the queue, not in the route files: renderJob
// already resolves the user's tier inside the worker "so it's correct even for
// jobs queued across an upgrade", and the same reasoning applies to routing —
// a job queued while the GPU was down should still use it once it's back.
//
// Policy lives in the Config table (admin-editable, no deploy) following the
// same shape as getAutoClipPricing/getViralityWeights. lib/flags.ts is a
// global boolean map with no per-tier targeting, so it's used only for the
// kill switch.

import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/flags";
import { isGpuConfigured, isBreakerOpen } from "@/lib/gpu-service";
import { getUserTier } from "@/lib/auth";
import { tierAtLeast, type TierId } from "@/lib/plans/tiers";
import type { RenderTarget } from "@/utils/ffmpeg-render";

export interface GpuRouting {
  enabled: boolean;
  /** Tiers whose RENDERS may use the GPU. */
  renderTiers: TierId[];
  /**
   * Renders below these thresholds stay on CPU. NVENC only offloads the
   * ENCODE — libass subtitle burn-in, crop, zoompan, the mood grade and the
   * watermark all remain CPU-bound, and feeding NVENC costs an hwupload. For a
   * short 1080p clip the S3 round-trip plus cold start comfortably exceeds the
   * whole CPU render, so routing everything to the GPU would be slower AND
   * more expensive. These gates encode "only when the CPU path is genuinely
   * slow": large frames or long clips.
   */
  minSourcePixels: number;
  minClipSec: number;
  /** Tiers whose ANALYSIS may use the GPU active-speaker model. */
  asdEnabled: boolean;
  asdTiers: TierId[];
}

export const GPU_ROUTING_DEFAULTS: GpuRouting = {
  enabled: true,
  renderTiers: ["pro", "studio"],
  minSourcePixels: 1920 * 1080,
  minClipSec: 25,
  asdEnabled: true,
  // ASD is the workload that actually justifies the GPU — it has no CPU
  // equivalent — so it reaches further down the tier list than rendering does.
  asdTiers: ["creator", "pro", "studio"],
};

export async function getGpuRouting(): Promise<GpuRouting> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "gpu_routing" } });
    if (!row) return GPU_ROUTING_DEFAULTS;
    return { ...GPU_ROUTING_DEFAULTS, ...(JSON.parse(row.value) as Partial<GpuRouting>) };
  } catch {
    return GPU_ROUTING_DEFAULTS;
  }
}

/** Cheap global gate shared by both workloads. */
async function gpuUsable(routing: GpuRouting): Promise<boolean> {
  if (!routing.enabled || !isGpuConfigured()) return false;
  // Kill switch first — it must work even if Redis is unhealthy.
  if (!(await isFeatureEnabled("gpu_service", true))) return false;
  if (await isBreakerOpen()) return false;
  return true;
}

export interface RenderTargetContext {
  sourceW: number;
  sourceH: number;
  clipDurationSec: number;
}

/**
 * CPU or GPU for one clip render. Never throws: any uncertainty resolves to
 * "cpu", which always works.
 */
export async function resolveRenderTarget(userId: string, ctx: RenderTargetContext): Promise<RenderTarget> {
  try {
    const routing = await getGpuRouting();
    if (!(await gpuUsable(routing))) return "cpu";

    const tier = await getUserTier(userId);
    if (!routing.renderTiers.includes(tier)) return "cpu";

    const pixels = ctx.sourceW * ctx.sourceH;
    // Unknown dimensions (getMediaDimensions returns 0x0 on a probe failure)
    // must not be read as "small" — but they also aren't evidence of a big
    // frame, so fall back to the duration gate alone.
    const bigEnough = pixels > 0 ? pixels >= routing.minSourcePixels : false;
    const longEnough = ctx.clipDurationSec >= routing.minClipSec;
    return bigEnough || longEnough ? "gpu" : "cpu";
  } catch {
    return "cpu";
  }
}

/** Whether this user's analysis may use the GPU active-speaker model. */
export async function shouldUseAsd(userId: string): Promise<boolean> {
  try {
    const routing = await getGpuRouting();
    if (!routing.asdEnabled) return false;
    if (!(await gpuUsable(routing))) return false;
    return tierAtLeast(await getUserTier(userId), lowestOf(routing.asdTiers));
  } catch {
    return false;
  }
}

function lowestOf(tiers: TierId[]): TierId {
  const order: TierId[] = ["free", "creator", "pro", "studio"];
  for (const t of order) if (tiers.includes(t)) return t;
  return "studio";
}
