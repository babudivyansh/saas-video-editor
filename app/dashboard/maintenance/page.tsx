// The maintenance state for one feature. Not linked anywhere: proxy.ts
// rewrites a switched-off feature's pages here (keeping their URL) for
// everyone but admins — see lib/feature-maintenance.ts.

import type { Metadata } from "next";
import { FeatureMaintenance } from "@/app/components/maintenance/FeatureMaintenance";
import { getMaintenanceFeature } from "@/lib/feature-maintenance-registry";

export const metadata: Metadata = { title: "Under maintenance" };

export default async function FeatureMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string | string[] }>;
}) {
  const { feature } = await searchParams;
  const id = Array.isArray(feature) ? feature[0] : feature;
  return <FeatureMaintenance featureName={id ? getMaintenanceFeature(id)?.label : undefined} />;
}
