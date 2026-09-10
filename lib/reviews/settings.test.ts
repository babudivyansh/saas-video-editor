import { beforeEach, describe, expect, it, vi } from "vitest";

let configRow: { key: string; value: string } | null;
const redisStore = new Map<string, string>();

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { redisStore.set(key, value); }),
    del: vi.fn(async (key: string) => { redisStore.delete(key); }),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: {
      findUnique: vi.fn(async () => configRow),
      upsert: vi.fn(async () => configRow),
    },
  },
}));

const { REVIEW_SETTINGS_DEFAULTS, getReviewSettings } = await import("./settings");

beforeEach(() => {
  configRow = null;
  redisStore.clear();
});

describe("REVIEW_SETTINGS_DEFAULTS", () => {
  // Guards the product decision that anyone signed in can review straight
  // away. Re-gating submissions should be an explicit, deliberate edit that
  // has to update this test — not something that drifts back in.
  it("ships with no submission criteria", () => {
    expect(REVIEW_SETTINGS_DEFAULTS.requireProductUsage).toBe(false);
    expect(REVIEW_SETTINGS_DEFAULTS.minAccountAgeHours).toBe(0);
  });
});

describe("getReviewSettings", () => {
  it("returns the defaults when no Config row exists", async () => {
    await expect(getReviewSettings()).resolves.toEqual(REVIEW_SETTINGS_DEFAULTS);
  });

  // The reason flipping the default alone isn't enough in production: an
  // existing reviews_settings row wins over it, so the admin panel still has
  // to be checked after deploy.
  it("lets a stored row override a default", async () => {
    configRow = { key: "reviews_settings", value: JSON.stringify({ requireProductUsage: true }) };
    const settings = await getReviewSettings();
    expect(settings.requireProductUsage).toBe(true);
    expect(settings.promptThrottleDays).toBe(REVIEW_SETTINGS_DEFAULTS.promptThrottleDays);
  });

  it("falls back to the defaults when the stored row is unparseable", async () => {
    configRow = { key: "reviews_settings", value: "{not json" };
    await expect(getReviewSettings()).resolves.toEqual(REVIEW_SETTINGS_DEFAULTS);
  });
});
