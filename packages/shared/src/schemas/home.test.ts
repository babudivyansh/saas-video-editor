import { describe, expect, it } from "vitest";
import { assistantSendRequest, clipThumbSchema, homeSummarySchema, toolCostSchema, toolSchema } from "./home";

const summary = {
  user: { name: "Maya Okafor", avatarUrl: null },
  clipMinutes: { remaining: 1000, total: 1200 },
  aiCredits: { remaining: 1171 },
  clips: { total: 24, top: [{ id: "c1", score: 92, durationSec: 41, thumbnailUrl: "https://cdn.example/c1.jpg" }] },
  projects: { active: 3, rendering: 1, renderProgress: 75 },
  creator: { level: "Pro Creator", xp: 1450, nextLevelXp: 2600 },
  unreadNotifications: 2,
  referralPercent: 20,
};

describe("home schemas", () => {
  it("accepts a dashboard summary", () => {
    expect(homeSummarySchema.parse(summary)).toEqual(summary);
  });

  it("rejects impossible values", () => {
    expect(clipThumbSchema.safeParse({ id: "c", score: 101, durationSec: 1, thumbnailUrl: "x" }).success).toBe(false);
    expect(homeSummarySchema.safeParse({ ...summary, aiCredits: { remaining: -1 } }).success).toBe(false);
    expect(homeSummarySchema.safeParse({ ...summary, clips: { total: 5, top: Array(5).fill(summary.clips.top[0]) } }).success).toBe(false);
  });

  it("prices a tool by kind", () => {
    expect(toolCostSchema.parse({ kind: "credits", amount: 8, per: "min" })).toEqual({ kind: "credits", amount: 8, per: "min", from: false });
    expect(toolCostSchema.safeParse({ kind: "credits", amount: 0, per: null }).success).toBe(false);
    expect(toolCostSchema.safeParse({ kind: "minutes" }).success).toBe(false);
  });

  it("only knows the pro tier gate", () => {
    const base = { id: "t", name: "T", shortName: "T", description: "d", category: "video", cost: { kind: "free" }, requiredTier: null };
    expect(toolSchema.parse(base).recommended).toBe(false);
    expect(toolSchema.safeParse({ ...base, requiredTier: "studio" }).success).toBe(false);
  });

  it("trims and requires an assistant message", () => {
    expect(assistantSendRequest.parse({ text: "  hi  " }).text).toBe("hi");
    expect(assistantSendRequest.safeParse({ text: "   " }).success).toBe(false);
  });
});
