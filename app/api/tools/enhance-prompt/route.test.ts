import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// CLIPIRO-WEB-13: a prompt Gemini blocked (PROHIBITED_CONTENT) made
// `response.text()` throw outside any try/catch, an unhandled 500.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test-key" } }));
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/with-retry", () => ({ withRetry: (fn: (s: AbortSignal) => unknown) => fn(new AbortController().signal) }));

const generateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = () => ({ generateContent });
  },
}));

const { POST } = await import("./route");
const req = (prompt: string) =>
  new NextRequest("http://localhost/api/tools/enhance-prompt", { method: "POST", body: JSON.stringify({ prompt }) });

beforeEach(() => {
  generateContent.mockReset();
  vi.clearAllMocks();
});

describe("POST /api/tools/enhance-prompt", () => {
  it("returns the enhanced prompt", async () => {
    generateContent.mockResolvedValue({ response: { text: () => "  a cat, golden hour  " } });
    const res = await POST(req("a cat"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prompt: "a cat, golden hour" });
  });

  it("answers 422 with a policy message when Gemini blocks the prompt", async () => {
    generateContent.mockResolvedValue({
      response: {
        promptFeedback: { blockReason: "PROHIBITED_CONTENT" },
        text: () => { throw new Error("[GoogleGenerativeAI Error]: Text not available. Response was blocked due to PROHIBITED_CONTENT"); },
      },
    });
    const res = await POST(req("something"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/content policy/);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("answers 422 when only text() reveals the block", async () => {
    generateContent.mockResolvedValue({
      response: { text: () => { throw new Error("[GoogleGenerativeAI Error]: Text not available. Response was blocked due to SAFETY"); } },
    });
    expect((await POST(req("x"))).status).toBe(422);
  });

  it("answers 502, not an unhandled throw, when Gemini fails", async () => {
    generateContent.mockRejectedValue(new Error("503 overloaded"));
    const res = await POST(req("a cat"));
    expect(res.status).toBe(502);
    expect(logger.error).toHaveBeenCalled();
  });
});
