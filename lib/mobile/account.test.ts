import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountSchema, activityPageSchema, homeSummarySchema, plansResponseSchema, toolsResponseSchema } from "@clipiro/shared";

// The /me, /home, /plans and /tools builders over a fake database. Every
// answer is also checked against the shared schema the app parses with.

const DAY = 86_400_000;
let user: Record<string, unknown> | null;
let quests: { questId: string }[];
let affiliate: { commissionRate: number } | null;
let creditTx: Record<string, unknown>[];
let minuteTx: Record<string, unknown>[];

const byDateDesc = (rows: Record<string, unknown>[], where: { createdAt?: { lt: Date } }) =>
  rows
    .filter((r) => !where.createdAt || (r.createdAt as Date) < where.createdAt.lt)
    .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => user) },
    userQuest: { findMany: vi.fn(async () => quests) },
    affiliate: { findUnique: vi.fn(async () => affiliate) },
    notification: { count: vi.fn(async () => 3) },
    clip: {
      count: vi.fn(async () => 24),
      findMany: vi.fn(async () => [
        { id: "c1", score: 92, durationSec: 41.4, thumbnailUrl: "https://bucket.s3.amazonaws.com/t1.jpg" },
        { id: "c2", score: 88, durationSec: 28, thumbnailUrl: null },
      ]),
    },
    project: {
      count: vi.fn(async () => 3),
      findMany: vi.fn(async (q: { where: { id?: unknown } }) =>
        q.where.id ? [{ id: "p42", title: "Founders Pod · Ep. 42" }] : [{ progress: 50 }, { progress: 100 }],
      ),
    },
    creditTransaction: { findMany: vi.fn(async (q: { where: { createdAt?: { lt: Date } }; take: number }) => byDateDesc(creditTx, q.where).slice(0, q.take)) },
    minuteTransaction: { findMany: vi.fn(async (q: { where: { createdAt?: { lt: Date } }; take: number }) => byDateDesc(minuteTx, q.where).slice(0, q.take)) },
  },
}));
vi.mock("@/lib/auth", () => ({ listSessions: vi.fn(async () => [{}, {}]) }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => (u ? `${u}?signed` : null)) }));
vi.mock("@/lib/project-activity", () => ({ startedResumableWhere: () => ({}) }));
let toolConfig: Record<string, { enabled: boolean; creditCost: number }>;
vi.mock("@/lib/tool-config", () => ({ getAllToolConfigs: vi.fn(async () => toolConfig) }));
let publicPlans: Record<string, unknown>[];
vi.mock("@/lib/plans/public", () => ({ getPublicPlans: vi.fn(async () => publicPlans) }));

const { buildAccount, buildActivity, buildHomeSummary, buildPlans, buildTools, describeReason } = await import("./account");

const studio = {
  id: "u1",
  email: "maya@creatorlab.co",
  name: "Maya Okafor",
  avatarUrl: null,
  hasPassword: true,
  credits: 1171,
  minutes: 1000,
  monthlyCredits: 400,
  monthlyMinutes: 1000,
  subscriptionEndsAt: new Date(Date.now() + 160 * DAY),
  subscriptionCancelledAt: null,
  plan: { name: "Studio (Yearly)", tier: "studio", intervalMonths: 12 },
};

beforeEach(() => {
  user = { ...studio };
  quests = [{ questId: "join-community" }, { questId: "first-clip" }, { questId: "hear-yourself-out" }, { questId: "picture-this" }, { questId: "first-export" }, { questId: "explore-toolbox" }];
  affiliate = null;
  creditTx = [];
  minuteTx = [];
  toolConfig = {};
});

describe("account", () => {
  it("describes a yearly Studio subscriber", async () => {
    const a = accountSchema.parse(await buildAccount("u1"));
    expect(a.plan).toEqual({ tier: "studio", term: "yearly", renewsAt: (studio.subscriptionEndsAt as Date).toISOString(), cancelAtPeriodEnd: false });
    // 500 + 300 + 200 + 200 + 200 + 150 XP = 1,550: Pro Creator, the top rank next.
    expect(a.creator).toEqual({ level: "Pro Creator", xp: 1550, nextLevelXp: 2600 });
    expect(a.aiCredits).toEqual({ remaining: 1171, allowance: 400 });
    expect([a.unreadNotifications, a.activeSessions, a.referralPercent]).toEqual([3, 2, 20]);
  });

  it("treats a lapsed subscription as Free, with the free allowances", async () => {
    user = { ...studio, subscriptionEndsAt: new Date(Date.now() - DAY), subscriptionCancelledAt: new Date() };
    const a = accountSchema.parse(await buildAccount("u1"));
    expect(a.plan).toEqual({ tier: "free", term: null, renewsAt: null, cancelAtPeriodEnd: false });
    expect([a.clipMinutes.allowance, a.aiCredits.allowance]).toEqual([30, 10]);
  });

  it("flags a cancelled-but-running plan and an affiliate's own rate", async () => {
    user = { ...studio, subscriptionCancelledAt: new Date() };
    affiliate = { commissionRate: 0.25 };
    const a = await buildAccount("u1");
    expect([a?.plan.cancelAtPeriodEnd, a?.referralPercent]).toEqual([true, 25]);
  });

  it("builds Home from the same account, with signed thumbnails only", async () => {
    const h = homeSummarySchema.parse(await buildHomeSummary("u1"));
    expect(h.clips).toEqual({ total: 24, top: [{ id: "c1", score: 92, durationSec: 41, thumbnailUrl: "https://bucket.s3.amazonaws.com/t1.jpg?signed" }] });
    expect(h.projects).toEqual({ active: 3, rendering: 2, renderProgress: 75 });
  });
});

describe("activity", () => {
  it.each([
    ["spend:voiceover", "Voiceover", "voiceover"],
    ["spend:image-generator", "Image Generator", "image"],
    ["spend:subtitle-remover", "Subtitle Remover", "other"],
    ["refund:auto-clip-dub-failed", "Refund · Clip dubbing", "refund"],
    ["refund:caption-render-failed", "Refund · Premium captions", "refund"],
    ["refund:editor-render-stranded", "Refund · Editor export", "refund"],
    ["grant:pack", "Credit pack", "purchase"],
    ["grant:minute-pack", "Minute pack", "purchase"],
    ["grant:quest-rank-Creator", "Level reward · Creator", "other"],
    ["grant:refill", "Monthly refill", "other"],
    ["grant:admin-refill", "Added by Clipiro support", "other"],
    ["expire", "Expired", "other"],
  ])("labels %s", (reason, label, kind) => {
    expect(describeReason(reason)).toEqual({ label, kind });
  });

  it("merges both ledgers newest first, names AutoClip projects, and pages", async () => {
    const t = (min: number) => new Date(Date.now() - min * 60_000);
    creditTx = Array.from({ length: 25 }, (_, i) => ({ id: `ct${i}`, delta: -2, reason: "spend:image-generator", refId: null, createdAt: t(10 + i * 10) }));
    minuteTx = [
      { id: "mt1", delta: -59, reason: "spend:auto-clip", refId: "p42", createdAt: t(5) },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `mz${i}`, delta: 30, reason: "grant:refill", refId: null, createdAt: t(1000 + i) })),
    ];
    const page1 = activityPageSchema.parse(await buildActivity("u1", null));
    expect(page1.items).toHaveLength(30);
    expect(page1.items[0]).toMatchObject({ id: "m_mt1", label: "AutoClip · Founders Pod · Ep. 42", kind: "autoclip", delta: -59, unit: "minutes" });
    const page2 = await buildActivity("u1", page1.nextCursor);
    expect(page2.items).toHaveLength(6);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(36);
  });
});

describe("plans and tools", () => {
  const sub = (tier: string, months: number, inr: number, usd: number) => ({
    slug: `sub_${tier}_${months === 1 ? "1mo" : "12mo"}`, kind: "subscription", tier, intervalMonths: months, priceInPaise: inr, usdPriceInCents: usd, monthlyMinutes: 150, monthlyCredits: 50, credits: 0, minutes: null,
  });
  const pack = (slug: string, kind: string, credits: number, minutes: number | null, inr: number, usd: number) => ({ slug, kind, credits, minutes, priceInPaise: inr, usdPriceInCents: usd, tier: null, intervalMonths: null });

  it("prices plans and packs live, and drops a tier the web switched off", async () => {
    publicPlans = [sub("creator", 1, 99900, 1500), sub("creator", 12, 803200, 11999), pack("pack_mini", "pack", 30, null, 59900, 699), pack("minutes_100", "minute_pack", 0, 100, 79900, 1199)];
    const p = plansResponseSchema.parse(await buildPlans());
    expect(p.plans.map((x) => x.tier)).toEqual(["free", "creator"]);
    expect(p.plans[1]).toMatchObject({ monthly: { usdCents: 1500, inrPaise: 99900 }, yearly: { usdCents: 11999, inrPaise: 803200 }, storageGb: 2, uploadHours: 2 });
    expect(p.creditPacks).toEqual([{ id: "pack_mini", name: "Mini", credits: 30, price: { usdCents: 699, inrPaise: 59900 }, bestValue: false }]);
    expect(p.minutePacks).toEqual([{ id: "minutes_100", minutes: 100, price: { usdCents: 1199, inrPaise: 79900 } }]);
  });

  it("prices tools from the live config, and leaves switched-off tools out", async () => {
    toolConfig = { voiceover: { enabled: true, creditCost: 2 }, "face-swap": { enabled: false, creditCost: 2 } };
    const { tools } = toolsResponseSchema.parse({ tools: await buildTools() });
    const by = Object.fromEntries(tools.map((t) => [t.id, t]));
    expect(by.autoclip!.cost).toEqual({ kind: "clipMinutes" });
    expect(by.voiceover!.cost).toEqual({ kind: "credits", amount: 2, per: "500 chars", from: false });
    expect(by["image-generator"]!.cost).toMatchObject({ kind: "credits", from: true });
    expect(by["mp3-converter"]!.cost).toEqual({ kind: "free" });
    expect(by["subtitle-remover"]!.requiredTier).toBe("pro");
    expect(by["face-swap"]).toBeUndefined();
    // Never listed in the Play app (decision 2026-10-10).
    expect(by["youtube-downloader"]).toBeUndefined();
    expect(by["instagram-downloader"]).toBeUndefined();
  });
});
