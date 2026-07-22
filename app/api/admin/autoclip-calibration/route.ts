import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { autoclipCalibrationSchema } from "@/lib/admin/schemas";
import { getViralityWeights, DEFAULT_VIRALITY_WEIGHTS } from "@/lib/virality-score";
import { recalibrateViralityWeights } from "@/lib/virality-calibration";

// Admin toggle for AutoClip virality-score recalibration (lib/virality-calibration.ts).
// Off by default: the hand-tuned DEFAULT_VIRALITY_WEIGHTS stay in effect until
// an admin explicitly opts in, by which point there should be enough
// published-clip engagement data for a recalibration to be more signal than noise.
export const GET = withAdmin(async () => {
  const [enabledRow, weights] = await Promise.all([
    prisma.config.findUnique({ where: { key: "autoclip_calibration_enabled" } }),
    getViralityWeights(),
  ]);
  return NextResponse.json({
    enabled: enabledRow?.value === "true",
    weights,
    defaults: DEFAULT_VIRALITY_WEIGHTS,
  });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, autoclipCalibrationSchema);

  await prisma.config.upsert({
    where: { key: "autoclip_calibration_enabled" },
    update: { value: String(body.enabled) },
    create: { key: "autoclip_calibration_enabled", value: String(body.enabled) },
  });

  await auditAdminAction(admin.userId, "autoclip_calibration.toggled", undefined, {
    after: { enabled: body.enabled },
    ip: auditIp(req),
  });

  return NextResponse.json({ enabled: body.enabled });
});

// Manually trigger a recalibration pass on demand (the cron job at
// /api/cron/social-refresh?job=recalibrate-virality is the recurring path;
// this lets an admin preview the effect immediately after enabling).
export const POST = withAdmin(async (req, { admin }) => {
  const before = await getViralityWeights();
  const result = await recalibrateViralityWeights();

  if (result.updated) {
    await auditAdminAction(admin.userId, "autoclip_calibration.recalibrated", undefined, {
      before, after: { weights: result.weights, sampleSize: result.sampleSize }, ip: auditIp(req),
    });
  }

  return NextResponse.json(result);
});
