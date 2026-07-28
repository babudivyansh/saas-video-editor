import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let authUser: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

const evaluatePromptTrigger = vi.fn();
const recordPrompt = vi.fn(async () => {});
vi.mock("@/lib/reviews/prompt-triggers", () => ({
  evaluatePromptTrigger: (...args: unknown[]) => evaluatePromptTrigger(...args),
  recordPrompt: (...args: unknown[]) => recordPrompt(...args),
}));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/reviews/prompt-check", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer tok" } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: "u1", email: "u1@test.com", sessionId: "s1" };
});

describe("POST /api/reviews/prompt-check", () => {
  it("401s when unauthenticated", async () => {
    authUser = null;
    const res = await post({ trigger: "export_complete" });
    expect(res.status).toBe(401);
  });

  it("400s on an invalid trigger", async () => {
    const res = await post({ trigger: "not_a_real_trigger" });
    expect(res.status).toBe(400);
  });

  it("returns shouldPrompt:false and does not record when the trigger doesn't qualify", async () => {
    evaluatePromptTrigger.mockResolvedValue({ shouldPrompt: false });
    const res = await post({ trigger: "export_complete" });
    const data = await res.json();
    expect(data.shouldPrompt).toBe(false);
    expect(recordPrompt).not.toHaveBeenCalled();
  });

  it("records the prompt when the trigger qualifies", async () => {
    evaluatePromptTrigger.mockResolvedValue({ shouldPrompt: true, trigger: "export_complete" });
    const res = await post({ trigger: "export_complete" });
    const data = await res.json();
    expect(data.shouldPrompt).toBe(true);
    expect(recordPrompt).toHaveBeenCalledWith("u1", "export_complete", undefined);
  });

  it("accepts tool_generation_complete and billing_success, and passes featureHint through", async () => {
    evaluatePromptTrigger.mockResolvedValue({ shouldPrompt: true, trigger: "tool_generation_complete" });
    const res = await post({ trigger: "tool_generation_complete", featureHint: "ai_tools" });
    expect(res.status).toBe(200);
    expect(recordPrompt).toHaveBeenCalledWith("u1", "tool_generation_complete", "ai_tools");
  });

  it("rejects days_active from the client (cron-only)", async () => {
    const res = await post({ trigger: "days_active" });
    expect(res.status).toBe(400);
  });
});
