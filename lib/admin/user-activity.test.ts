import { beforeEach, describe, expect, it, vi } from "vitest";

const t = (iso: string) => new Date(iso);
const rows = {
  user: {
    createdAt: t("2026-11-10T10:00:00Z"), hasPassword: false, intendedUse: "gaming",
    signupSource: null as string | null, signupReferrer: "instagram.com", signupLandingPath: "/gta-6-clip-maker",
  },
  logins: [{ id: "l1", createdAt: t("2026-11-10T10:01:00Z"), device: "Chrome on Windows", country: "IN" }],
  uploads: [{ id: "a1", createdAt: t("2026-11-11T09:00:00Z"), name: "stream.mp4", kind: "video", size: BigInt(52_428_800), duration: 1200, sourceFeature: "upload" }],
  runs: [
    { id: "p1", title: "Stream", status: "ready", failureReason: null, createdAt: t("2026-11-11T09:05:00Z"), updatedAt: t("2026-11-11T09:20:00Z"), _count: { clips: 6 } },
    { id: "p2", title: "Podcast", status: "failed", failureReason: "We couldn't read this video file.", createdAt: t("2026-11-12T08:00:00Z"), updatedAt: t("2026-11-12T08:03:00Z"), _count: { clips: 0 } },
  ],
  generations: [] as unknown[],
  purchases: [{ id: "pay_1", createdAt: t("2026-11-13T12:00:00Z"), amountInPaise: 79900, currency: "INR", status: "captured", minutes: 300, credits: 0, plan: { name: "Creator" } }],
  subEvents: [{ id: "s1", createdAt: t("2026-11-13T12:00:01Z"), type: "activated", reason: null }],
  events: [
    { id: "e1", createdAt: t("2026-11-10T10:00:00Z"), type: "signup", meta: { method: "google", referralCode: "AARAV20" } },
    { id: "e2", createdAt: t("2026-11-11T09:30:00Z"), type: "download", meta: { name: "clip-1.mp4", area: "clips" } },
  ],
};

// Each source honours the `createdAt < before` cursor, like Postgres would.
const lt = <T extends { createdAt: Date }>(list: T[], where: { createdAt?: { lt: Date } }) =>
  list.filter((r) => !where.createdAt || r.createdAt < where.createdAt.lt);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => rows.user) },
    loginEvent: {
      findMany: vi.fn(async ({ where }) => lt(rows.logins, where)),
      count: vi.fn(async () => 4),
      findFirst: vi.fn(async () => ({ country: "IN", device: "Chrome on Windows" })),
    },
    asset: { findMany: vi.fn(async ({ where }) => lt(rows.uploads, where)), count: vi.fn(async () => 1) },
    project: {
      findMany: vi.fn(async ({ where }) => {
        const before: Date = where.OR[0].createdAt.lt;
        return rows.runs.filter((r) => r.createdAt < before || r.updatedAt < before);
      }),
      groupBy: vi.fn(async () => [{ status: "ready", _count: { _all: 1 } }, { status: "failed", _count: { _all: 1 } }]),
      findFirst: vi.fn(async () => ({ createdAt: rows.runs[0].createdAt })),
    },
    clip: { count: vi.fn(async () => 6) },
    generation: { findMany: vi.fn(async () => rows.generations), count: vi.fn(async () => 0) },
    purchase: {
      findMany: vi.fn(async ({ where }) => lt(rows.purchases, where)),
      aggregate: vi.fn(async () => ({ _sum: { amountInPaise: 79900 }, _count: { _all: 1 } })),
    },
    subscriptionEvent: { findMany: vi.fn(async ({ where }) => lt(rows.subEvents, where)) },
    userEvent: {
      findMany: vi.fn(async ({ where }) => lt(rows.events, where)),
      count: vi.fn(async () => 1),
      findFirst: vi.fn(async () => ({ meta: { method: "google", referralCode: "AARAV20", utm: { source: "instagram", medium: "social", campaign: "gta6" } } })),
    },
  },
}));

const { getUserActivitySummary, getUserTimeline } = await import("./user-activity");

beforeEach(() => vi.clearAllMocks());

describe("getUserTimeline", () => {
  it("merges every source newest first", async () => {
    const { items, nextBefore } = await getUserTimeline("u1");
    expect(items.map((i) => i.title)).toEqual([
      "Subscription activated",
      "Paid ₹799.00",
      "AutoClip failed",
      "Started AutoClip: Podcast",
      "Downloaded clip-1.mp4",
      "AutoClip finished: 6 clips",
      "Started AutoClip: Stream",
      "Uploaded video: stream.mp4",
      "Logged in",
      "Signed up with Google",
    ]);
    expect(items.at(-1)?.detail).toBe("Makes: gaming · Referral AARAV20");
    expect(items.find((i) => i.kind === "autoclip_failed")?.tone).toBe("error");
    expect(nextBefore).toBeNull();
  });

  it("pages with a cursor without losing or repeating rows", async () => {
    const first = await getUserTimeline("u1", { limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.nextBefore).toBe(first.items[3].at);

    const second = await getUserTimeline("u1", { limit: 4, before: new Date(first.nextBefore!) });
    const third = await getUserTimeline("u1", { limit: 4, before: new Date(second.nextBefore!) });
    const all = [...first.items, ...second.items, ...third.items].map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(10);
  });
});

describe("getUserActivitySummary", () => {
  it("counts runs by outcome and paid total", async () => {
    const s = await getUserActivitySummary("u1");
    expect(s.attribution).toEqual({
      method: "google", intendedUse: "gaming", referralCode: "AARAV20",
      utm: { source: "instagram", medium: "social", campaign: "gta6" }, country: "IN", device: "Chrome on Windows",
      referrer: "instagram.com", landingPath: "/gta-6-clip-maker",
    });
  });

  // Signups whose UTM was only written to User.signupSource (no UserEvent meta).
  it("falls back to User.signupSource for the campaign", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.userEvent.findFirst).mockResolvedValueOnce(null);
    rows.user.signupSource = "youtube/video/launch";
    const s = await getUserActivitySummary("u1");
    rows.user.signupSource = null;
    expect(s.attribution?.utm).toEqual({ source: "youtube", medium: "video", campaign: "launch" });
    expect(s.attribution?.referralCode).toBeNull();
    expect(s).toMatchObject({ autoClipRuns: 2, autoClipReady: 1, autoClipFailed: 1, clips: 6, logins: 4, downloads: 1, paidTotalInPaise: 79900, payments: 1 });
  });
});
