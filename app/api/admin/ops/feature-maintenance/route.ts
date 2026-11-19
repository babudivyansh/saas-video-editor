import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { featureMaintenancePatchSchema } from "@/lib/admin/schemas";
import { getFeatureMaintenance, setFeatureMaintenance, type FeatureMaintenanceMap } from "@/lib/feature-maintenance";
import { MAINTENANCE_FEATURES, MAINTENANCE_GROUP_LABELS, isMaintenanceFeatureId } from "@/lib/feature-maintenance-registry";

// Per-feature maintenance switches (admin Ops → Maintenance). The store and
// the gates are lib/feature-maintenance.ts.

function rows(map: FeatureMaintenanceMap) {
  return MAINTENANCE_FEATURES.map((f) => ({
    id: f.id,
    label: f.label,
    group: f.group,
    groupLabel: MAINTENANCE_GROUP_LABELS[f.group],
    pagePaths: f.pagePaths,
    apiPaths: f.apiPaths,
    on: f.id in map,
    since: map[f.id]?.since ?? null,
  }));
}

export const GET = withAdmin(async () => {
  return NextResponse.json({ features: rows(await getFeatureMaintenance()) });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const { feature, on } = await parseBody(req, featureMaintenancePatchSchema);
  if (!isMaintenanceFeatureId(feature)) {
    return NextResponse.json({ error: "Unknown feature" }, { status: 400 });
  }
  const before = feature in (await getFeatureMaintenance());
  const map = await setFeatureMaintenance(feature, on, admin.userId);
  if (before !== on) {
    await auditAdminAction(admin.userId, on ? "feature_maintenance.enabled" : "feature_maintenance.disabled", feature, {
      before: { on: before },
      after: { on },
      ip: auditIp(req),
    });
  }
  return NextResponse.json({ features: rows(map) });
});
