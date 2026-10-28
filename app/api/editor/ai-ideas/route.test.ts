import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser), getUserTier: vi.fn(async () => "free") }));

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test-key" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// Free under the same daily fair-use bucket as /api/editor/ai-text — the
// credit engine must never be touched, so it is a tripwire here.
const spendCredits = vi.fn();
vi.mock("@/lib/credits", () => ({ spendCredits: (...a: unknown[]) => spendCredits(...a), restoreSpend: vi.fn() }));
const takeFairUse = vi.fn(async (..._a: unknown[]): Promise<{ allowed: true } | { allowed: false; limit: number; message: string }> => ({ allowed: true }));
vi.mock("@/lib/fair-use", () => ({ takeFairUse: (...a: unknown[]) => takeFairUse(...a) }));

const generateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = () => ({ generateContent });
  },
}));

const reply = (text: string) => ({ response: { text: () => text } });

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/editor/ai-ideas", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/editor/ai-ideas", () => {
  beforeEach(() => {
    spendCredits.mockClear();
    takeFairUse.mockClear();
    generateContent.mockReset();
    authUser = { userId: "u1" };
  });

  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await POST(makeRequest({ kind: "hooks", brief: "mornings" }));
    expect(res.status).toBe(401);
    expect(takeFairUse).not.toHaveBeenCalled();
  });

  it("400s on an unknown kind or an empty / over-long brief, without using the allowance", async () => {
    expect((await POST(makeRequest({ kind: "poems", brief: "mornings" }))).status).toBe(400);
    expect((await POST(makeRequest({ kind: "hooks", brief: "   " }))).status).toBe(400);
    expect((await POST(makeRequest({ kind: "hooks", brief: "x".repeat(501) }))).status).toBe(400);
    expect(takeFairUse).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("is free: takes one editor-ai-text slot and returns cleaned lines", async () => {
    generateContent.mockResolvedValue(reply('1. "Your mornings are broken"\n2. Stop scrolling before 9am\n\n- I tried this for 30 days'));
    const res = await POST(makeRequest({ kind: "hooks", brief: "3 habits that changed my mornings" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ideas).toEqual(["Your mornings are broken", "Stop scrolling before 9am", "I tried this for 30 days"]);
    expect(takeFairUse).toHaveBeenCalledWith("u1", "editor-ai-text", "free");
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("passes the fair-use message through as a 429 without calling the model", async () => {
    takeFairUse.mockResolvedValueOnce({ allowed: false, limit: 5, message: "Daily limit reached" });
    const res = await POST(makeRequest({ kind: "titles", brief: "mornings" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Daily limit reached");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("500s when the model returns nothing usable", async () => {
    generateContent.mockResolvedValue(reply("\n  \n"));
    const res = await POST(makeRequest({ kind: "ctas", brief: "mornings" }));
    expect(res.status).toBe(500);
  });
});
