// Runtime per-model overrides for the static registries in lib/models/*.
// Same Config-KV + short-Redis-cache pattern as lib/tool-config.ts. Lets an
// admin kill a misbehaving model or reprice it without a deploy.
//
// creditCost override semantics follow each registry's own field: flat credits
// for image models, credits-per-second for video models.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export interface ModelOverride {
  enabled?: boolean; // false = generation requests are refused
  creditCost?: number; // image: flat credits · video: credits per second
}
export type ModelOverrideMap = Record<string, ModelOverride>;

const CONFIG_KEY = "model_overrides";
const CACHE_KEY = "admin:model_overrides";
const CACHE_TTL = 60;

export async function getModelOverrides(): Promise<ModelOverrideMap> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as ModelOverrideMap;
    } catch {
      /* fall through */
    }
  }
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
  let map: ModelOverrideMap = {};
  if (row) {
    try {
      map = JSON.parse(row.value) as ModelOverrideMap;
    } catch {
      map = {};
    }
  }
  await redis.set(CACHE_KEY, JSON.stringify(map), "EX", CACHE_TTL);
  return map;
}

// patch merges into the model's existing override; passing null clears it.
export async function setModelOverride(modelId: string, patch: ModelOverride | null): Promise<ModelOverrideMap> {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
  let map: ModelOverrideMap = {};
  if (row) {
    try {
      map = JSON.parse(row.value) as ModelOverrideMap;
    } catch {
      map = {};
    }
  }
  if (patch === null) delete map[modelId];
  else map[modelId] = { ...map[modelId], ...patch };

  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(map) },
    create: { key: CONFIG_KEY, value: JSON.stringify(map) },
  });
  await redis.del(CACHE_KEY);
  return map;
}
