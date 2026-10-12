// @vitest-environment node
//
// Clipiro AI on the server: the model loop (text streams, tools run and feed
// back, cards come out), the tools reading only the caller's data and spending
// nothing, and the daily allowance.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionCall } from "@google/generative-ai";

const h = vi.hoisted(() => ({
  project: { findMany: vi.fn(), findFirst: vi.fn() },
  clip: { findMany: vi.fn(), findFirst: vi.fn() },
  asset: { findMany: vi.fn() },
  tier: vi.fn(async () => "pro"),
  accounts: vi.fn(async () => [] as unknown[]),
  audience: vi.fn(),
  counter: { n: 0 },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { project: h.project, clip: h.clip, asset: h.asset } }));
vi.mock("@/lib/auth", () => ({ getUserTier: h.tier }));
vi.mock("@/lib/social/queries", () => ({ loadAccounts: h.accounts }));
vi.mock("@/lib/mobile/social", () => ({ buildAudience: h.audience }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string | null) => u && `${u}?signed`) }));
vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "k" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/redis", () => ({
  redis: {
    incrWithExpire: vi.fn(async () => ++h.counter.n),
    decrFloor: vi.fn(async () => { h.counter.n = Math.max(0, h.counter.n - 1); }),
    get: vi.fn(async () => String(h.counter.n)),
  },
}));

const { runAssistant, toHistory } = await import("./run");
const { TOOLS, nextAt, queryWords } = await import("./tools");
const store = await import("./store");

const ctx = { userId: "u1", tz: "Asia/Kolkata", now: new Date("2026-10-12T06:00:00.000Z") };

/** A Gemini chat that answers each turn from a script: text pieces, then maybe tool calls. */
function scripted(turns: { text?: string[]; calls?: FunctionCall[] }[]) {
  const requests: unknown[] = [];
  let i = 0;
  return {
    requests,
    start: () => ({
      sendMessageStream: async (req: unknown) => {
        requests.push(req);
        const t = turns[i++] ?? {};
        return {
          stream: (async function* () {
            for (const piece of t.text ?? []) yield { text: () => piece };
          })(),
          response: Promise.resolve({ functionCalls: () => t.calls }),
        };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.counter.n = 0;
  h.tier.mockResolvedValue("pro");
  h.accounts.mockResolvedValue([]);
});

describe("the model loop", () => {
  it("streams text, runs the tools it asks for, feeds results back, and returns the cards", async () => {
    h.project.findFirst.mockResolvedValue({ id: "p1", title: "Founders Pod · Ep. 42" });
    h.clip.findMany.mockResolvedValue([
      { id: "c1", index: 0, title: "Nobody tells you this", score: 92, durationSec: 41, thumbnailUrl: "https://t/c1.jpg", transcriptJson: [{ word: "Nobody" }, { word: "tells" }], scoreBreakdown: { hook: 95 } },
    ]);
    const model = scripted([{ text: ["Let me look."], calls: [{ name: "find_hooks", args: { projectId: "p1" } }] }, { text: ["Your best ", "hook is the first one."] }]);
    const events: { type: string }[] = [];
    const out = await runAssistant({ ctx, history: [], text: "best hooks in ep 42", startChat: model.start }, (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual(["text", "status", "card", "text", "text"]);
    expect(out.text).toBe("Let me look.Your best hook is the first one.");
    expect(out.cards[0]).toMatchObject({ type: "hooks", projectId: "p1", clips: [{ id: "c1", score: 92, thumbnailUrl: "https://t/c1.jpg?signed" }] });
    // The tool's result went back to the model as a function response.
    expect(model.requests[1]).toEqual([{ functionResponse: { name: "find_hooks", response: expect.objectContaining({ project: "Founders Pod · Ep. 42" }) } }]);
  });

  it("tells the model about an unknown tool instead of crashing", async () => {
    const model = scripted([{ calls: [{ name: "delete_everything", args: {} }] }, { text: ["I can't do that."] }]);
    const out = await runAssistant({ ctx, history: [], text: "x", startChat: model.start }, () => {});
    expect(model.requests[1]).toEqual([{ functionResponse: { name: "delete_everything", response: { error: "No such tool." } } }]);
    expect(out.text).toBe("I can't do that.");
  });

  it("stops after a few rounds of tool calls", async () => {
    const loop = { calls: [{ name: "list_projects", args: {} }] };
    h.project.findMany.mockResolvedValue([]);
    const model = scripted([loop, loop, loop, loop, loop]);
    const out = await runAssistant({ ctx, history: [], text: "x", startChat: model.start }, () => {});
    expect(model.requests).toHaveLength(4);
    expect(out.text).toMatch(/couldn’t finish/);
  });

  it("starts history with the person and drops empty turns", () => {
    expect(toHistory([{ role: "assistant", text: "hi" }, { role: "user", text: "a" }, { role: "assistant", text: " " }, { role: "assistant", text: "b" }])).toEqual([
      { role: "user", parts: [{ text: "a" }] },
      { role: "model", parts: [{ text: "b" }] },
    ]);
  });
});

describe("tools", () => {
  it("find a project by any meaningful word, else offer the latest", async () => {
    // Found live: Gemini searched "demo project" for a project titled "demo-90s-480p.mp4".
    expect(queryWords("my demo project")).toEqual(["demo"]);
    expect(queryWords("Ep. 42 podcast")).toEqual(["ep", "42"]);
    const p = { id: "p1", title: "demo-90s-480p.mp4", status: "completed", productType: "auto-clip", createdAt: new Date("2026-10-01"), _count: { clips: 2 } };
    h.project.findMany.mockResolvedValueOnce([p]);
    expect((await TOOLS.list_projects!.run(ctx, { query: "my demo project" })).result).toEqual({ projects: [expect.objectContaining({ id: "p1", readyClips: 2 })] });
    expect(h.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", OR: [{ title: { contains: "demo", mode: "insensitive" } }] } }));
    h.project.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([p]);
    expect((await TOOLS.list_projects!.run(ctx, { query: "wedding" })).result).toMatchObject({ note: expect.stringMatching(/Nothing matched/), projects: [expect.objectContaining({ id: "p1" })] });
  });

  it("only look at the caller's projects and clips", async () => {
    h.project.findMany.mockResolvedValue([]);
    await TOOLS.list_projects!.run(ctx, {});
    expect(h.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    h.project.findFirst.mockResolvedValue(null);
    expect((await TOOLS.find_hooks!.run(ctx, { projectId: "theirs" })).result).toEqual({ error: "No such project for this person." });
    expect(h.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "theirs", userId: "u1" } }));
    h.clip.findFirst.mockResolvedValue(null);
    expect((await TOOLS.get_clip!.run(ctx, { clipId: "theirs" })).result).toEqual({ error: "No such clip for this person." });
    expect(h.clip.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "theirs", project: { userId: "u1" } } }));
  });

  it("show a caption with clean hashtags, and drop a clip id that isn't theirs", async () => {
    h.clip.findFirst.mockResolvedValue(null);
    const out = await TOOLS.show_caption!.run(ctx, { clipId: "theirs", caption: "Most founders never say this.", hashtags: ["Founders", "#startup", "not a tag!"] });
    expect(out.card).toEqual({ type: "caption", clipId: null, caption: "Most founders never say this.", hashtags: ["#founders", "#startup", "#notatag"] });
  });

  it("set up AutoClip without starting or charging anything", async () => {
    h.asset.findMany.mockResolvedValue([{ id: "a1", name: "Ep 42.mp4", duration: 3520, thumbnailS3Key: null }]);
    const out = await TOOLS.create_clips!.run(ctx, { query: "ep 42" });
    expect(out.card).toEqual({ type: "autoclip", assetId: "a1", name: "Ep 42.mp4", durationSec: 3520, estimatedMinutes: 59 });
    expect(out.result.note).toMatch(/Not started/);
    expect(h.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "u1", kind: "video" }) }));
  });

  it("suggest a posting time from the audience, or general guidance on Free", async () => {
    h.accounts.mockResolvedValue([{ id: "acc1", provider: "youtube", status: "active" }]);
    const online = Array.from({ length: 7 }, (_, d) => Array.from({ length: 6 }, (_, b) => (d === 3 && b === 4 ? 90 : 10)));
    h.audience.mockResolvedValue({ online });
    expect((await TOOLS.suggest_posting_time!.run(ctx, { platform: "youtube" })).card).toMatchObject({ type: "best_time", source: "audience", label: "Thu around 4 PM" });
    h.tier.mockResolvedValue("free");
    expect((await TOOLS.suggest_posting_time!.run(ctx, { platform: "youtube" })).card).toMatchObject({ source: "general", label: "Fri around 6 PM" });
    expect(h.audience).toHaveBeenCalledTimes(1);
  });

  it("put the next occurrence in the person's time zone, in the future", () => {
    // Monday 11:30 in Kolkata → next Friday 18:00 Kolkata = 12:30 UTC.
    expect(nextAt(4, 18, "Asia/Kolkata", ctx.now)).toBe("2026-10-16T12:30:00.000Z");
  });
});

describe("allowance", () => {
  it("allows the day's messages, then refuses, and a failed reply gives one back", async () => {
    expect(await store.takeMessage("u1", 2)).toBe(true);
    expect(await store.takeMessage("u1", 2)).toBe(true);
    expect(await store.takeMessage("u1", 2)).toBe(false);
    expect((await store.remaining("u1", 2)).remaining).toBe(0);
    await store.giveBack("u1");
    expect((await store.remaining("u1", 2)).remaining).toBe(1);
  });

  it("is 20 on Free and 200 on paid plans", async () => {
    h.tier.mockResolvedValueOnce("free");
    expect(await store.dailyLimit("u1")).toBe(20);
    expect(await store.dailyLimit("u1")).toBe(200);
  });
});
