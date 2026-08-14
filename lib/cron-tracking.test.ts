import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const setCalls: Array<{ key: string; value: string; ex: number }> = [];

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (k: string, v: string, _mode: string, ex: number) => {
      store.set(k, v);
      setCalls.push({ key: k, value: v, ex });
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { recordCronRun, getCronRunStatuses, KNOWN_CRON_NAMES } = await import("./cron-tracking");

beforeEach(() => {
  store.clear();
  setCalls.length = 0;
  vi.clearAllMocks();
});

describe("cron-tracking", () => {
  it("records a run with an ISO timestamp under a fortnight TTL", async () => {
    await recordCronRun("refill-credits");
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].key).toBe("cron:lastrun:refill-credits");
    expect(() => new Date(setCalls[0].value).toISOString()).not.toThrow();
    expect(setCalls[0].ex).toBe(14 * 24 * 60 * 60);
  });

  it("reports every known cron, with age for those that have run and null for those that haven't", async () => {
    await recordCronRun("refill-credits");
    const statuses = await getCronRunStatuses();

    expect(statuses).toHaveLength(KNOWN_CRON_NAMES.length);

    const ran = statuses.find((s) => s.name === "refill-credits")!;
    expect(ran.lastRunAt).not.toBeNull();
    expect(ran.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(ran.ageSeconds).toBeLessThan(5);

    const neverRan = statuses.find((s) => s.name === "account-purge")!;
    expect(neverRan.lastRunAt).toBeNull();
    expect(neverRan.ageSeconds).toBeNull();
  });
});
