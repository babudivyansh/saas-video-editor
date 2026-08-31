import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test-key" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const spendCredits = vi.fn(async () => ({ ok: true, balances: { total: 10 } }));
const restoreSpend = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/credits", () => ({ spendCredits: (...a: unknown[]) => spendCredits(...a), restoreSpend: (...a: unknown[]) => restoreSpend(...a) }));

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

  it("spends a credit, calls Gemini, and returns the trimmed result", async () => {
    generateContent.mockResolvedValue(reply("  A punchier line.  "));
    const res = await POST(makeRequest({ operation: "rewrite", text: "a line" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.result).toBe("A punchier line.");
    expect(spendCredits).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", amount: 1, reason: "spend:editor-ai-text" }));
    expect(restoreSpend).not.toHaveBeenCalled();
  });

  it("passes the target language through to the translate prompt", async () => {
    generateContent.mockResolvedValue(reply("Una línea."));
    await POST(makeRequest({ operation: "translate", text: "a line", targetLang: "Spanish" }));
    expect(generateContent).toHaveBeenCalledWith(expect.stringContaining("Spanish"), expect.anything());
  });

  it("refunds and returns a sanitized error when Gemini fails", async () => {
    generateContent.mockRejectedValue(new Error("upstream 500: {\"detail\":\"quota exceeded, key sk-abc123\"}"));
    const res = await POST(makeRequest({ operation: "grammar", text: "a line" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).not.toContain("sk-abc123");
    expect(json.error).not.toContain("quota exceeded");
    expect(restoreSpend).toHaveBeenCalledTimes(1);
    expect(restoreSpend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", reason: "refund:editor-ai-text-failed" }));
  });

  it("refunds when Gemini returns an empty response", async () => {
    generateContent.mockResolvedValue(reply("   "));
    const res = await POST(makeRequest({ operation: "shorten", text: "a line" }));
    expect(res.status).toBe(500);
    expect(restoreSpend).toHaveBeenCalledTimes(1);
  });

  it("402s without calling Gemini when the user has insufficient credits", async () => {
    spendCredits.mockResolvedValueOnce({ ok: false, reason: "insufficient_credits", balances: { total: 0 } } as never);
    const res = await POST(makeRequest({ operation: "expand", text: "a line" }));
    expect(res.status).toBe(402);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
