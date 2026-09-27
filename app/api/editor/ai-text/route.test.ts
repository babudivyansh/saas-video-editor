import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser), getUserTier: vi.fn(async () => "free") }));

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test-key" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// Free since 2026-09-26 under a daily fair-use cap: it must never touch the
// credit engine, so the engine is a tripwire here.
const spendCredits = vi.fn();
const restoreSpend = vi.fn();
vi.mock("@/lib/credits", () => ({ spendCredits: (...a: unknown[]) => spendCredits(...a), restoreSpend: (...a: unknown[]) => restoreSpend(...a) }));
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
  return new NextRequest("http://localhost/api/editor/ai-text", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/editor/ai-text", () => {
  beforeEach(() => {
    spendCredits.mockClear();
    restoreSpend.mockClear();
    takeFairUse.mockClear();
    generateContent.mockReset();
    authUser = { userId: "u1" };
  });

  it("401s without spending when unauthenticated", async () => {
    authUser = null;
    const res = await POST(makeRequest({ operation: "rewrite", text: "hello" }));
    expect(res.status).toBe(401);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("400s on an unknown operation, without spending", async () => {
    const res = await POST(makeRequest({ operation: "not-a-real-op", text: "hello" }));
    expect(res.status).toBe(400);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("400s on empty text, without spending", async () => {
    const res = await POST(makeRequest({ operation: "rewrite", text: "   " }));
    expect(res.status).toBe(400);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("400s on text over the length cap, without spending", async () => {
    const res = await POST(makeRequest({ operation: "rewrite", text: "x".repeat(4001) }));
    expect(res.status).toBe(400);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("is free: takes one fair-use slot, calls Gemini, and returns the trimmed result", async () => {
    generateContent.mockResolvedValue(reply("  A punchier line.  "));
    const res = await POST(makeRequest({ operation: "rewrite", text: "a line" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.result).toBe("A punchier line.");
    expect(takeFairUse).toHaveBeenCalledWith("u1", "editor-ai-text", "free");
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("passes the target language through to the translate prompt", async () => {
    generateContent.mockResolvedValue(reply("Una línea."));
    await POST(makeRequest({ operation: "translate", text: "a line", targetLang: "Spanish" }));
    expect(generateContent).toHaveBeenCalledWith(expect.stringContaining("Spanish"), expect.anything());
  });

  it("returns a sanitized error when Gemini fails, with nothing to refund", async () => {
    generateContent.mockRejectedValue(new Error("upstream 500: {\"detail\":\"quota exceeded, key sk-abc123\"}"));
    const res = await POST(makeRequest({ operation: "grammar", text: "a line" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).not.toContain("sk-abc123");
    expect(json.error).not.toContain("quota exceeded");
    expect(restoreSpend).not.toHaveBeenCalled();
  });

  it("treats an empty Gemini response as a failure", async () => {
    generateContent.mockResolvedValue(reply("   "));
    const res = await POST(makeRequest({ operation: "shorten", text: "a line" }));
    expect(res.status).toBe(500);
  });

  it("429s without calling Gemini once today's fair-use allowance is spent", async () => {
    takeFairUse.mockResolvedValueOnce({ allowed: false, limit: 5, message: "You've used today's 5 free uses of this tool." });
    const res = await POST(makeRequest({ operation: "expand", text: "a line" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/today's 5 free uses/);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
