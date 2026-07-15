import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { modelOverrideSchema } from "@/lib/admin/schemas";
import { getModelOverrides, setModelOverride } from "@/lib/model-overrides";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { VIDEO_MODELS } from "@/lib/models/videoModels";

// GET  — both registries merged with runtime overrides.
// PATCH — set/clear a model's override (enable/disable, credit repricing).
export const GET = withAdmin(async () => {
  const overrides = await getModelOverrides();

  const image = IMAGE_MODELS.map((m) => ({
    id: m.id,
    kind: "image" as const,
    displayName: m.displayName,
    provider: m.provider,
    category: m.category,
    allowedTiers: m.allowedTiers,
    defaultCreditCost: m.creditCost,
    costUsd: m.costUsd,
    override: overrides[m.id] ?? null,
  }));
  const video = VIDEO_MODELS.map((m) => ({
    id: m.id,
    kind: "video" as const,
    displayName: m.displayName,
    provider: m.provider,
    category: m.category,
    allowedTiers: m.allowedTiers,
    defaultCreditCost: m.creditsPerSecond, // per second
    costUsd: m.costUsd, // per second
    override: overrides[m.id] ?? null,
  }));

  return NextResponse.json({ image, video });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const { modelId, enabled, creditCost, clear } = await parseBody(req, modelOverrideSchema);

  const known = [...IMAGE_MODELS, ...VIDEO_MODELS].some((m) => m.id === modelId);
  if (!known) return NextResponse.json({ error: "Unknown model id" }, { status: 404 });

  const before = (await getModelOverrides())[modelId] ?? null;
  const patch = clear
    ? null
    : {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(creditCost !== undefined ? (creditCost === null ? { creditCost: undefined } : { creditCost }) : {}),
      };
  const map = await setModelOverride(modelId, patch);

  await auditAdminAction(admin.userId, "model.override_updated", modelId, {
    before,
    after: map[modelId] ?? null,
    ip: auditIp(req),
  });

  return NextResponse.json({ override: map[modelId] ?? null });
});
