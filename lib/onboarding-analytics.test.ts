import { beforeEach, describe, expect, it, vi } from "vitest";

const upserts: Array<{ where: unknown; create: unknown; update: unknown }> = [];
let upsertImpl: (args: { where: unknown; create: unknown; update: unknown }) => Promise<unknown> = async (args) => {
  upserts.push(args);
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    onboardingEventDaily: {
      upsert: vi.fn((args: { where: unknown; create: unknown; update: unknown }) => upsertImpl(args)),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { trackOnboardingEvent } = await import("./onboarding-analytics");
const flush = () => new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget upsert settle

beforeEach(() => {
  upserts.length = 0;
  upsertImpl = async (args) => { upserts.push(args); };
  vi.clearAllMocks();
});

describe("trackOnboardingEvent — durable default sink", () => {
  it("upserts a per-day counter keyed by (date, event)", async () => {
    trackOnboardingEvent("u1", "tour_completed", { step: 3 });
    await flush();
    const today = new Date().toISOString().slice(0, 10);
    expect(upserts).toEqual([
      {
        where: { date_event: { date: today, event: "tour_completed" } },
        create: { date: today, event: "tour_completed", count: 1 },
        update: { count: { increment: 1 } },
      },
    ]);
  });

  it("never throws even if the DB write rejects (fire-and-forget)", async () => {
    upsertImpl = async () => { throw new Error("db down"); };
    expect(() => trackOnboardingEvent("u1", "welcome_shown")).not.toThrow();
    await flush();
  });
});
