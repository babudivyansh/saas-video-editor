import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Clipiro AI's routes: the reply streams as newline-delimited events, the
// question and reply are saved, the daily allowance holds, and a reply that
// fails before writing anything doesn't count.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), requireSubscriber: vi.fn(), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
const h = vi.hoisted(() => ({
  env: { GEMINI_API_KEY: "k" as string | undefined },
  take: vi.fn(async () => true),
  giveBack: vi.fn(async () => {}),
  saved: [] as { role: string; text: string; cards: unknown[] }[],
  run: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/assistant/store", () => ({
  history: vi.fn(async () => [{ id: "m0", role: "user", text: "earlier", createdAt: "2026-10-11T00:00:00.000Z" }]),
  remaining: vi.fn(async () => ({ remaining: 19, limit: 20 })),
  dailyLimit: vi.fn(async () => 20),
  takeMessage: h.take,
  giveBack: h.giveBack,
  prune: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
  save: vi.fn(async (_u: string, role: string, text: string, cards: unknown[] = []) => {
    h.saved.push({ role, text, cards });
    return { id: `m${h.saved.length}`, role, text, createdAt: "2026-10-12T00:00:00.000Z", ...(cards.length ? { cards } : {}) };
  }),
}));
vi.mock("@/lib/assistant/run", () => ({ chatOverride: () => undefined, toHistory: (m: unknown[]) => m, runAssistant: h.run }));

const { GET, POST } = await import("./messages/route");
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/mobile/v1/assistant/messages?tz=Asia/Kolkata", { method, headers: { authorization: "Bearer a" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const events = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));

beforeEach(() => {
  vi.clearAllMocks();
  h.saved.length = 0;
  h.env.GEMINI_API_KEY = "k";
  h.take.mockResolvedValue(true);
});

describe("POST /assistant/messages", () => {
  it("streams the saved question, the reply as it's written, a card, then the saved reply", async () => {
    const card = { type: "caption", clipId: null, caption: "Hi", hashtags: [] };
    h.run.mockImplementation(async (_o: unknown, emit: (e: unknown) => void) => {
      emit({ type: "text", delta: "Here " });
      emit({ type: "card", card });
      emit({ type: "text", delta: "you go." });
      return { text: "Here you go.", cards: [card] };
    });
    const res = await POST(req("POST", { text: "write a caption" }));
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const ev = await events(res);
    expect(ev.map((e) => e.type)).toEqual(["user", "text", "card", "text", "done"]);
    expect(ev[0].message).toMatchObject({ role: "user", text: "write a caption" });
    expect(ev.at(-1)).toMatchObject({ message: { role: "assistant", text: "Here you go.", cards: [card] }, remaining: 19 });
    expect(h.saved.map((s) => s.role)).toEqual(["user", "assistant"]);
    expect((h.run.mock.calls[0]![0] as { ctx: { tz: string } }).ctx.tz).toBe("Asia/Kolkata");
  });

  it("refuses past the day's allowance before saving or calling the model", async () => {
    h.take.mockResolvedValue(false);
    const res = await POST(req("POST", { text: "hi" }));
    expect([res.status, (await res.json()).code]).toEqual([429, "assistant_limit"]);
    expect(h.saved).toEqual([]);
    expect(h.run).not.toHaveBeenCalled();
  });

  it("gives the message back when the reply fails before writing anything", async () => {
    h.run.mockRejectedValue(new Error("model down"));
    const ev = await events(await POST(req("POST", { text: "hi" })));
    expect(ev.at(-1)).toMatchObject({ type: "error", code: "assistant_failed" });
    expect(h.giveBack).toHaveBeenCalledWith("u1");
  });

  it("says it's unavailable without a model key", async () => {
    h.env.GEMINI_API_KEY = undefined;
    const res = await POST(req("POST", { text: "hi" }));
    expect([res.status, (await res.json()).code]).toEqual([503, "assistant_unavailable"]);
  });
});

describe("GET /assistant/messages", () => {
  it("returns the conversation and today's allowance", async () => {
    expect(await (await GET(req("GET"))).json()).toEqual({ messages: [expect.objectContaining({ id: "m0" })], remaining: 19, limit: 20 });
  });
});
