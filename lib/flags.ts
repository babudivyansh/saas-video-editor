// Feature flags + maintenance mode on the Config-KV pattern (lib/tool-config).
//
// Maintenance mode is special: it's checked in proxy.ts on API traffic, so the
// durable Config value is mirrored to a plain Redis key and cached in-process
// for 15s — the hot path costs at most one Redis GET per process per 15s, not
// one per request.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export interface MaintenanceMode {
  on: boolean;
  message?: string;
}
export type FeatureFlagMap = Record<string, boolean>;

const FLAGS_KEY = "feature_flags";
const MAINT_KEY = "maintenance_mode";
const MAINT_REDIS_KEY = "maintenance_mode"; // no TTL; a Redis flush fails open (mode off)
const CACHE_TTL = 60;

export async function getFeatureFlags(): Promise<FeatureFlagMap> {
  const cached = await redis.get(`admin:${FLAGS_KEY}`);
  if (cached) {
    try {
      return JSON.parse(cached) as FeatureFlagMap;
    } catch {
      /* fall through */
    }
  }
  const row = await prisma.config.findUnique({ where: { key: FLAGS_KEY } });
  const map = safeParse<FeatureFlagMap>(row?.value) ?? {};
  await redis.set(`admin:${FLAGS_KEY}`, JSON.stringify(map), "EX", CACHE_TTL);
  return map;
}

export async function isFeatureEnabled(name: string, fallback = false): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[name] ?? fallback;
}

export async function setFeatureFlag(name: string, value: boolean | null): Promise<FeatureFlagMap> {
  const row = await prisma.config.findUnique({ where: { key: FLAGS_KEY } });
  const map = safeParse<FeatureFlagMap>(row?.value) ?? {};
  if (value === null) delete map[name];
  else map[name] = value;
  await prisma.config.upsert({
    where: { key: FLAGS_KEY },
    update: { value: JSON.stringify(map) },
    create: { key: FLAGS_KEY, value: JSON.stringify(map) },
  });
  await redis.del(`admin:${FLAGS_KEY}`);
  return map;
}

export async function getMaintenanceMode(): Promise<MaintenanceMode> {
  const raw = await redis.get(MAINT_REDIS_KEY);
  const parsed = safeParse<MaintenanceMode>(raw);
  if (parsed) return parsed;
  const row = await prisma.config.findUnique({ where: { key: MAINT_KEY } });
  return safeParse<MaintenanceMode>(row?.value) ?? { on: false };
}

export async function setMaintenanceMode(mode: MaintenanceMode): Promise<void> {
  await prisma.config.upsert({
    where: { key: MAINT_KEY },
    update: { value: JSON.stringify(mode) },
    create: { key: MAINT_KEY, value: JSON.stringify(mode) },
  });
  await redis.set(MAINT_REDIS_KEY, JSON.stringify(mode));
}

// In-process 15s cache for the proxy hot path (Redis-only read; no prisma —
// the proxy must stay light).
let maintCache: { until: number; value: MaintenanceMode } = { until: 0, value: { on: false } };

export async function getMaintenanceModeCached(): Promise<MaintenanceMode> {
  if (Date.now() < maintCache.until) return maintCache.value;
  const raw = await redis.get(MAINT_REDIS_KEY);
  const value = safeParse<MaintenanceMode>(raw) ?? { on: false };
  maintCache = { until: Date.now() + 15_000, value };
  return value;
}

function safeParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
