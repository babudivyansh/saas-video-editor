// Per-feature maintenance mode: the store and the gate. The list of features
// and their pages/routes is lib/feature-maintenance-registry.ts.
//
// Storage follows lib/flags.ts's site-wide maintenance switch: the durable
// value is a Config row, mirrored to one Redis key (no TTL) and cached
// in-process for 15s, because proxy.ts reads it for every page view and API
// call that belongs to a feature. A toggle therefore reaches every server
// process within ~15 seconds.
//
// Every read fails OPEN (nothing in maintenance): a Redis or database blip
// must never take features offline that the admin didn't switch off.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import {
  FEATURE_MAINTENANCE_MESSAGE,
  getMaintenanceFeature,
  isMaintenanceFeatureId,
} from "@/lib/feature-maintenance-registry";

/** Features currently in maintenance → when and by whom it was switched on. */
export type FeatureMaintenanceMap = Record<string, { since: string; by?: string }>;

const CONFIG_KEY = "feature_maintenance";
const REDIS_KEY = "feature_maintenance";
const LOCAL_TTL_MS = 15_000;

function parse(raw: string | null | undefined): FeatureMaintenanceMap | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    // Drop ids that no longer exist (a deleted tool must not linger).
    const out: FeatureMaintenanceMap = {};
    for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isMaintenanceFeatureId(id) && entry && typeof entry === "object") {
        out[id] = entry as FeatureMaintenanceMap[string];
      }
    }
    return out;
  } catch {
    return null;
  }
}

async function loadFromDb(): Promise<FeatureMaintenanceMap> {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
  return parse(row?.value) ?? {};
}

/** Authoritative read: Redis mirror, falling back to (and re-seeding from) the Config row. */
export async function getFeatureMaintenance(): Promise<FeatureMaintenanceMap> {
  const cached = parse(await redis.get(REDIS_KEY).catch(() => null));
  if (cached) return cached;
  const fromDb = await loadFromDb();
  // Always written, even `{}`, so the next miss only follows a Redis flush.
  await redis.set(REDIS_KEY, JSON.stringify(fromDb)).catch(() => {});
  return fromDb;
}

let local: { until: number; value: FeatureMaintenanceMap } = { until: 0, value: {} };

/** Hot-path read for proxy.ts and the route gates: 15s in-process cache. */
export async function getFeatureMaintenanceCached(): Promise<FeatureMaintenanceMap> {
  if (Date.now() < local.until) return local.value;
  const value = await getFeatureMaintenance().catch(() => ({}));
  local = { until: Date.now() + LOCAL_TTL_MS, value };
  return value;
}

/** Test seam: forget the in-process cache. */
export function resetFeatureMaintenanceCache(): void {
  local = { until: 0, value: {} };
}

export async function isFeatureUnderMaintenance(id: string): Promise<boolean> {
  return id in (await getFeatureMaintenanceCached());
}

/** Switch one feature on/off. Returns the new map. Unknown ids throw. */
export async function setFeatureMaintenance(id: string, on: boolean, adminId?: string): Promise<FeatureMaintenanceMap> {
  if (!isMaintenanceFeatureId(id)) throw new Error(`Unknown feature: ${id}`);
  const map = await loadFromDb();
  if (on) {
    if (!map[id]) map[id] = { since: new Date().toISOString(), ...(adminId ? { by: adminId } : {}) };
  } else {
    delete map[id];
  }
  const value = JSON.stringify(map);
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value },
    create: { key: CONFIG_KEY, value },
  });
  await redis.set(REDIS_KEY, value);
  resetFeatureMaintenanceCache();
  return map;
}

/** The 503 every refused call gets — same words as the page. */
export function featureMaintenanceResponse(featureId: string): NextResponse {
  return NextResponse.json(
    { error: FEATURE_MAINTENANCE_MESSAGE, maintenance: true, feature: featureId },
    { status: 503, headers: { "Retry-After": "300" } },
  );
}

async function isAdminRequest(req: NextRequest): Promise<boolean> {
  try {
    const { requireAdmin } = await import("@/lib/auth");
    return !!(await requireAdmin(req));
  } catch {
    return false; // fail secure: an error means "not known to be an admin"
  }
}

/**
 * Route-level gate. Returns the 503 to send when `featureId` is in
 * maintenance and the caller is not an admin (admins keep using it, to
 * test); null to carry on. Call it before anything is charged.
 */
export async function featureMaintenanceGate(req: NextRequest, featureId: string): Promise<NextResponse | null> {
  if (!getMaintenanceFeature(featureId)) return null;
  if (!(await isFeatureUnderMaintenance(featureId))) return null;
  if (await isAdminRequest(req)) return null;
  return featureMaintenanceResponse(featureId);
}

/** Same check for a page: true when this viewer should see the maintenance state. */
export async function shouldShowFeatureMaintenance(req: NextRequest, featureId: string): Promise<boolean> {
  if (!(await isFeatureUnderMaintenance(featureId))) return false;
  return !(await isAdminRequest(req));
}
