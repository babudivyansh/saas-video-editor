import { beforeEach, describe, expect, it, vi } from "vitest";

// State the mocks read/write, reset before each test.
let completedQuestIds: string[];
let claimedRankRewards: string[];
let grantCalls: Array<{ amount: number; reason: string; bucket: string }>;
let rewardEmails: Array<{ to: string; level: string; credits: number; balance: number }>;

vi.mock("./prisma", () => ({
  prisma: {
    userQuest: {
      upsert: vi.fn(async ({ create }: { create: { questId: string } }) => {
        if (!completedQuestIds.includes(create.questId)) completedQuestIds.push(create.questId);
        return {};
      }),
      findMany: vi.fn(async () => completedQuestIds.map(questId => ({ questId }))),
    },
    user: {
      findUnique: vi.fn(async () => ({
        claimedRankRewards,
        email: "creator@example.com",
        name: "Divyansh",
      })),
      update: vi.fn(async ({ data }: { data: { claimedRankRewards: string[] } }) => {
        claimedRankRewards = data.claimedRankRewards;
        return {};
      }),
    },
  },
}));

vi.mock("./redis", () => ({ redis: { del: vi.fn(async () => {}) } }));
vi.mock("./logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./onboarding-analytics", () => ({ trackOnboardingEvent: vi.fn() }));
vi.mock("./credits", () => ({
  grantCredits: vi.fn(async (p: { amount: number; reason: string; bucket: string }) => {
    grantCalls.push({ amount: p.amount, reason: p.reason, bucket: p.bucket });
    return { bonus: p.amount, subscription: 0, purchased: 0, total: 40 + p.amount };
  }),
}));
vi.mock("./email", () => ({
  sendQuestRankRewardEmail: vi.fn(
    async (to: string, _name: string, level: string, credits: number, balance: number) => {
      rewardEmails.push({ to, level, credits, balance });
    },
  ),
}));

import { markQuestComplete } from "./quests";

beforeEach(() => {
  completedQuestIds = [];
  claimedRankRewards = [];
  grantCalls = [];
  rewardEmails = [];
  vi.clearAllMocks();
});

describe("markQuestComplete rank rewards", () => {
  it("grants the Creator reward once when crossing 500 XP", async () => {
    // join-community is worth 500 XP → exactly the Creator threshold.
    await markQuestComplete("u1", "join-community");
    expect(grantCalls).toEqual([
      { amount: 5, reason: "grant:quest-rank-Creator", bucket: "bonus" },
    ]);
    expect(claimedRankRewards).toEqual(["Creator"]);
  });

  it("does not double-grant a rank on repeat completions", async () => {
    await markQuestComplete("u1", "join-community"); // → Creator (+5)
    grantCalls = [];
    // Re-completing the same quest keeps earnedXp at 500; Creator already claimed.
    await markQuestComplete("u1", "join-community");
    expect(grantCalls).toEqual([]);
    expect(claimedRankRewards).toEqual(["Creator"]);
  });

  it("grants each newly crossed rank exactly once as XP accumulates", async () => {
    await markQuestComplete("u1", "join-community"); // 500 → Creator (+5)
    await markQuestComplete("u1", "first-clip"); // 800
    await markQuestComplete("u1", "hear-yourself-out"); // 1000
    await markQuestComplete("u1", "picture-this"); // 1200 → Pro Creator (+10)

    const reasons = grantCalls.map(c => c.reason);
    expect(reasons).toEqual([
      "grant:quest-rank-Creator",
      "grant:quest-rank-Pro Creator",
    ]);
    expect(claimedRankRewards).toEqual(["Creator", "Pro Creator"]);
  });

  it("grants multiple newly earned ranks in a single completion when several thresholds are crossed at once", async () => {
    // Pre-seed everything but one quest so it lands well past Pro Creator with
    // Creator not yet claimed, exercising the multi-grant loop.
    completedQuestIds = ["first-clip", "hear-yourself-out", "picture-this", "first-video", "first-export"]; // 1100
    await markQuestComplete("u1", "upgraded-plan"); // +300 → 1400
    expect(grantCalls.map(c => c.reason)).toEqual([
      "grant:quest-rank-Creator",
      "grant:quest-rank-Pro Creator",
    ]);
  });
});

describe("markQuestComplete rank reward emails", () => {
  it("emails the user once per newly earned rank, with the credits and new balance", async () => {
    await markQuestComplete("u1", "join-community"); // 500 → Creator (+5)

    expect(rewardEmails).toEqual([
      { to: "creator@example.com", level: "Creator", credits: 5, balance: 45 },
    ]);
  });

  it("does not re-email a rank that was already claimed", async () => {
    await markQuestComplete("u1", "join-community");
    rewardEmails = [];

    // Same quest again — no new rank crossed, so nothing to announce.
    await markQuestComplete("u1", "join-community");

    expect(rewardEmails).toEqual([]);
  });

  it("emails every rank when several are crossed in one completion", async () => {
    completedQuestIds = ["first-clip", "hear-yourself-out", "picture-this", "first-video", "first-export"]; // 1100
    await markQuestComplete("u1", "upgraded-plan"); // +300 → 1400

    expect(rewardEmails.map(e => e.level)).toEqual(["Creator", "Pro Creator"]);
  });

  it("still records the grant when the reward email throws", async () => {
    const { sendQuestRankRewardEmail } = await import("./email");
    vi.mocked(sendQuestRankRewardEmail).mockRejectedValueOnce(new Error("smtp down"));

    await markQuestComplete("u1", "join-community");

    // The credits are the thing that must survive a mail failure.
    expect(grantCalls.map(c => c.reason)).toEqual(["grant:quest-rank-Creator"]);
    expect(claimedRankRewards).toEqual(["Creator"]);
  });
});
