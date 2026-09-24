// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { clipRow, translate, rerender, clipUpdate } = vi.hoisted(() => ({
  clipRow: { value: { id: "c1", status: "ready", transcriptJson: [{ word: "hola", start: 0, end: 300 }] } as Record<string, unknown> },
  translate: vi.fn(async (words: unknown[]) => words),
  rerender: vi.fn(async (_a: unknown) => ({ ok: true, creditsCharged: 0, creditsRemaining: 5 })),
  clipUpdate: vi.fn(async (_a: unknown) => ({})),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { clip: { findFirst: vi.fn(async () => clipRow.value), update: (a: unknown) => clipUpdate(a) } },
}));
vi.mock("@/lib/autoclip-rerender", () => ({ requestRerender: (a: unknown) => rerender(a) }));
vi.mock("@/lib/caption-translate", () => ({
  translateTranscript: (w: unknown[]) => translate(w),
  isSupportedCaptionLanguage: () => true,
}));
vi.mock("@/lib/languages", () => ({ CAPTION_LANGUAGES: [] }));

const { POST } = await import("./route");
const post = (body: Record<string, unknown> = { targetLang: "es" }) =>
  POST(
    new NextRequest("http://localhost/api/projects/p1/clips/c1/translate", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "p1", clipId: "c1" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  clipRow.value = { id: "c1", status: "ready", transcriptJson: [{ word: "hola", start: 0, end: 300 }] };
});

describe("POST .../translate", () => {
  it("refuses a busy clip BEFORE calling the model", async () => {
    // A busy clip used to get a free Gemini translation and then a 409.
    clipRow.value = { ...clipRow.value, status: "rendering" };
    const res = await post();
    expect(res.status).toBe(409);
    expect(translate).not.toHaveBeenCalled();
  });

  it("never writes into liteEdits — the strict schema then dropped speed, music and fades", async () => {
    const res = await post({ targetLang: "es", keepOriginal: true });
    expect(res.status).toBe(200);
    expect(clipUpdate).not.toHaveBeenCalled();
    expect(rerender).toHaveBeenCalledTimes(1);
  });
});
