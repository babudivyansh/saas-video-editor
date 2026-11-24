import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { isGpuConfigured } from "@/lib/gpu-service";
import { getFaceTrackingStatus } from "@/lib/render-target";
import {
  AUTOCLIP_AI_DEFAULTS, CONFIG_KEY, deepMergeConfig, getAutoClipAiConfig, mergeAutoClipAiConfig, type AutoClipAiConfig,
} from "@/lib/autoclip-ai/config";

// Admin switches for AutoClip's AI B-roll, reframing and keyframing
// (lib/autoclip-ai/config.ts). Same pattern as autoclip-pricing: one Config
// row, merged over the defaults, applied on the next run with no deploy.

// Loose on purpose: mergeAutoClipAiConfig validates and clamps every field,
// and drops what it doesn't know, so the stored row is always well-formed.
const patchSchema = z
  .object({
    features: z.record(z.string(), z.object({ enabled: z.boolean().optional(), tiers: z.array(z.string()).optional() })).optional(),
    broll: z.record(z.string(), z.unknown()).optional(),
    costCeilingUsd: z.record(z.string(), z.number().min(0).max(20)).optional(),
    unitCostUsd: z.record(z.string(), z.number().min(0).max(10)).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/** Which provider keys exist on this server, so the page can say why a feature never runs. */
function keyStatus() {
  return {
    gemini: Boolean(env.GEMINI_API_KEY),
    fal: Boolean(env.FAL_KEY),
    gpu: isGpuConfigured(),
  };
}

export const GET = withAdmin(async () => {
  const config = await getAutoClipAiConfig();
  return NextResponse.json({ config, defaults: AUTOCLIP_AI_DEFAULTS, keys: keyStatus(), faceTracking: await getFaceTrackingStatus() });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, patchSchema);
  const current = await getAutoClipAiConfig();
  const next: AutoClipAiConfig = mergeAutoClipAiConfig(deepMergeConfig(current, body));

  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: CONFIG_KEY, value: JSON.stringify(next) },
  });

  await auditAdminAction(admin.userId, "autoclip_ai.updated", undefined, {
    before: current,
    after: next,
    ip: auditIp(req),
  });

  return NextResponse.json({ config: next, keys: keyStatus() });
});
