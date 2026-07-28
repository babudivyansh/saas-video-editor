import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.CRON_SECRET = "test-secret";

let candidates: Array<{ id: string; email: string; firstName: string | null; name: string | null }>;
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn(async () => candidates) } },
}));

const evaluatePromptTrigger = vi.fn();
const recordPrompt = vi.fn(async () => {});
vi.mock("@/lib/reviews/prompt-triggers", () => ({
  evaluatePromptTrigger: (...args: unknown[]) => evaluatePromptTrigger(...args),
  recordPrompt: (...args: unknown[]) => recordPrompt(...args),
}));

const notify = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notify: (...args: unknown[]) => notify(...args) }));

const shouldSendCategory = vi.fn(async () => true);
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: (...args: unknown[]) => shouldSendCategory(...args) }));

const sendReviewPromptEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendReviewPromptEmail: (...args: unknown[]) => sendReviewPromptEmail(...args) }));

const { GET } = await import("./route");

function get(token?: string) {
  return GET(new NextRequest("http://localhost/api/cron/review-prompts", { headers: token ? { Authorization: `Bearer ${token}` } : undefined }));
}

beforeEach(() => {
  vi.clearAllMocks();
  candidates = [{ id: "u1", email: "u1@test.com", firstName: "U", name: null }];
  evaluatePromptTrigger.mockResolvedValue({ shouldPrompt: true, trigger: "days_active" });
  shouldSendCategory.mockResolvedValue(true);
});

describe("GET /api/cron/review-prompts", () => {
  it("401s without the correct bearer secret", async () => {
    const res = await get("wrong-secret");
    expect(res.status).toBe(401);
  });

  it("401s with no secret configured", async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    vi.resetModules();
    const { GET: GetFresh } = await import("./route");
    const res = await GetFresh(new NextRequest("http://localhost/api/cron/review-prompts", { headers: { Authorization: "Bearer test-secret" } }));
    expect(res.status).toBe(401);
    process.env.CRON_SECRET = original;
  });

  it("notifies and emails a qualifying candidate", async () => {
    const res = await get("test-secret");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.prompted).toBe(1);
    expect(recordPrompt).toHaveBeenCalledWith("u1", "days_active");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "review_prompt" }));
    expect(sendReviewPromptEmail).toHaveBeenCalled();
  });

  it("skips notifying a candidate the trigger doesn't qualify", async () => {
    evaluatePromptTrigger.mockResolvedValue({ shouldPrompt: false });
    const res = await get("test-secret");
    const data = await res.json();
    expect(data.prompted).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips the email when the user opted out of reviewPrompts", async () => {
    shouldSendCategory.mockResolvedValue(false);
    await get("test-secret");
    expect(notify).toHaveBeenCalled();
    expect(sendReviewPromptEmail).not.toHaveBeenCalled();
  });
});
