import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The store (Config row + Redis mirror + 15s in-process cache) and the gate
// (503 for users, pass for admins, fail open on errors).

const store = new Map<string, string>();
const redisData = new Map<string, string>();
const redisGet = vi.fn(async (k: string) => redisData.get(k) ?? null);
vi.mock("@/lib/redis", () => ({
  redis: {
    get: (k: string) => redisGet(k),
    set: vi.fn(async (k: string, v: string) => void redisData.set(k, v)),
  },
}));
const findUnique = vi.fn(async ({ where }: { where: { key: string } }) =>
  store.has(where.key) ? { key: where.key, value: store.get(where.key)! } : null,
);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: {
      findUnique: (args: { where: { key: string } }) => findUnique(args),
      upsert: vi.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => void store.set(where.key, update.value)),
    },
  },
}));
let isAdmin = false;
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => (isAdmin ? { userId: "admin1" } : null)) }));

const m = await import("./feature-maintenance");
const { FEATURE_MAINTENANCE_MESSAGE } = await import("./feature-maintenance-registry");

const req = () => new NextRequest("http://localhost/api/tools/voiceover", { method: "POST" });

beforeEach(() => {
  store.clear();
  redisData.clear();
  redisGet.mockClear();
  isAdmin = false;
  m.resetFeatureMaintenanceCache();
});

describe("feature maintenance store", () => {
  it("starts with nothing in maintenance", async () => {
    expect(await m.getFeatureMaintenance()).toEqual({});
    expect(await m.isFeatureUnderMaintenance("ai-voiceover")).toBe(false);
  });

  it("persists a switch to the Config row and the Redis mirror", async () => {
    await m.setFeatureMaintenance("ai-voiceover", true, "admin1");
    expect(JSON.parse(store.get("feature_maintenance")!)).toMatchObject({ "ai-voiceover": { by: "admin1" } });
    expect(JSON.parse(redisData.get("feature_maintenance")!)).toHaveProperty("ai-voiceover");
    expect(await m.isFeatureUnderMaintenance("ai-voiceover")).toBe(true);

    await m.setFeatureMaintenance("ai-voiceover", false);
    expect(await m.isFeatureUnderMaintenance("ai-voiceover")).toBe(false);
    expect(JSON.parse(store.get("feature_maintenance")!)).toEqual({});
  });

  it("re-seeds Redis from the Config row after a flush", async () => {
    store.set("feature_maintenance", JSON.stringify({ "auto-clip": { since: "2026-11-20T00:00:00Z" } }));
    expect(await m.getFeatureMaintenance()).toHaveProperty("auto-clip");
    expect(redisData.get("feature_maintenance")).toContain("auto-clip");
  });

  it("ignores ids that are no longer features", async () => {
    store.set("feature_maintenance", JSON.stringify({ "video-generator": { since: "x" }, "auto-clip": { since: "y" } }));
    expect(Object.keys(await m.getFeatureMaintenance())).toEqual(["auto-clip"]);
  });

  it("rejects unknown feature ids", async () => {
    await expect(m.setFeatureMaintenance("nope", true)).rejects.toThrow(/Unknown feature/);
  });

  it("caches in-process so the hot path reads Redis at most once per 15s", async () => {
    await m.isFeatureUnderMaintenance("auto-clip");
    await m.isFeatureUnderMaintenance("auto-clip");
    await m.isFeatureUnderMaintenance("ai-voiceover");
    expect(redisGet).toHaveBeenCalledTimes(1);
  });

  it("fails open when Redis and the database are both down", async () => {
    redisGet.mockRejectedValueOnce(new Error("redis down"));
    findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(await m.isFeatureUnderMaintenance("auto-clip")).toBe(false);
  });
});

describe("featureMaintenanceGate", () => {
  it("lets everyone through when the feature is live", async () => {
    expect(await m.featureMaintenanceGate(req(), "ai-voiceover")).toBeNull();
  });

  it("refuses a user with a 503 and the exact message", async () => {
    await m.setFeatureMaintenance("ai-voiceover", true);
    const res = await m.featureMaintenanceGate(req(), "ai-voiceover");
    expect(res?.status).toBe(503);
    expect(await res!.json()).toEqual({ error: FEATURE_MAINTENANCE_MESSAGE, maintenance: true, feature: "ai-voiceover" });
    expect(FEATURE_MAINTENANCE_MESSAGE).toBe("Under maintenance. Please check after some time.");
  });

  it("lets an admin through, for testing", async () => {
    await m.setFeatureMaintenance("ai-voiceover", true);
    isAdmin = true;
    expect(await m.featureMaintenanceGate(req(), "ai-voiceover")).toBeNull();
    expect(await m.shouldShowFeatureMaintenance(req(), "ai-voiceover")).toBe(false);
  });

  it("only gates the feature that is switched off", async () => {
    await m.setFeatureMaintenance("auto-clip", true);
    expect(await m.featureMaintenanceGate(req(), "ai-voiceover")).toBeNull();
    expect(await m.shouldShowFeatureMaintenance(req(), "auto-clip")).toBe(true);
  });
});
