import { beforeEach, describe, expect, it, vi } from "vitest";

// Guards the billing/validation contract of the shared re-render path. Before
// lib/autoclip-rerender.ts existed, the style and transcript routes enqueued
// renders with no charge, no rerenderCount increment and no rate limit — an
// unlimited free render button — while only the rerender route billed. These
// tests exist so a fifth caller can't quietly reintroduce that.

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b" },
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));

const enqueue = vi.fn(async () => {});
vi.mock("@/lib/render-queue", () => ({
  createRenderQueue: vi.fn(() => ({ enqueue, driver: "in-process" })),
  NonRetryableError: class extends Error {},
}));

vi.mock("@/lib/autoclip-pipeline", () => ({
  rerenderJob: vi.fn(async () => {}),
  getAutoClipPricing: vi.fn(async () => ({ perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1 })),
  rebaseClipWords: vi.fn((words: unknown[]) => words),
}));

const spendCredits = vi.fn(async () => ({ ok: true as const, balances: { total: 9 } }));
const restoreSpend = vi.fn(async () => 1);
vi.mock("@/lib/credits", () => ({
  spendCredits: (...a: unknown[]) => spendCredits(...(a as [])),
  restoreSpend: (...a: unknown[]) => restoreSpend(...(a as [])),
  getBalances: vi.fn(async () => ({ bonus: 0, subscription: 0, purchased: 9, total: 9 })),
}));

interface ClipRow {
  id: string; projectId: string; status: string; progress: number; rerenderCount: number;
  startSec: number; endSec: number; durationSec: number; aspectRatio: string;
  hasCaptions: boolean; captionStyleIndex: number | null;
  transcriptJson: unknown; subtitleStyleOverride: unknown; silenceSettings: unknown;
}

let clip: ClipRow;
let lastUpdate: Record<string, unknown> | null = null;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: vi.fn(async () => ({ id: "project-1", userId: "user-1" })) },
    clip: {
      findFirst: vi.fn(async () => clip),
      findUnique: vi.fn(async () => ({ rerenderCount: clip.rerenderCount, project: { userId: "user-1" } })),
      // Mirrors real Prisma: only matching rows are affected, so this IS the
      // atomic double-submit guard — a second concurrent call sees "queued"
      // and matches nothing.
      updateMany: vi.fn(async (args: {
        where: { status?: { notIn: string[] }; rerenderCount?: { gt: number } };
        data: Record<string, unknown>;
      }) => {
        const notIn = args.where.status?.notIn ?? [];
        if (notIn.includes(clip.status)) return { count: 0 };
        // The refund path guards its decrement on `rerenderCount > 0`, so the
        // mock has to honour that predicate or the counter-floor behaviour is
        // untested.
        if (args.where.rerenderCount && clip.rerenderCount <= args.where.rerenderCount.gt) return { count: 0 };
        const decrement = (args.data.rerenderCount as { decrement?: number } | undefined)?.decrement;
        if (decrement) {
          clip.rerenderCount -= decrement;
          const { rerenderCount: _skip, ...rest } = args.data;
          void _skip;
          Object.assign(clip, rest);
        } else {
          Object.assign(clip, args.data);
        }
        return { count: 1 };
      }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        lastUpdate = args.data;
        if (typeof args.data.rerenderCount === "number") clip.rerenderCount = args.data.rerenderCount;
        if ((args.data.rerenderCount as { decrement?: number } | undefined)?.decrement) {
          clip.rerenderCount -= (args.data.rerenderCount as { decrement: number }).decrement;
        }
        if (typeof args.data.status === "string") clip.status = args.data.status;
        return clip;
      }),
    },
  },
}));

const base = () => ({ userId: "user-1", projectId: "project-1", clipId: "clip-1", reason: "test" });

beforeEach(() => {
  vi.clearAllMocks();
  spendCredits.mockResolvedValue({ ok: true as const, balances: { total: 9 } });
  lastUpdate = null;
  clip = {
    id: "clip-1", projectId: "project-1", status: "ready", progress: 100, rerenderCount: 0,
    startSec: 0, endSec: 20, durationSec: 20, aspectRatio: "9:16",
    hasCaptions: true, captionStyleIndex: 0,
    transcriptJson: [{ word: "hi", start: 0, end: 100 }], subtitleStyleOverride: {}, silenceSettings: {},
  };
});

describe("sanitizeCaptionWord", () => {
  it("strips ASS override syntax so a transcript edit can't inject drawing tags", async () => {
    const { sanitizeCaptionWord } = await import("./autoclip-rerender");
    expect(sanitizeCaptionWord("{\\p1}m 0 0 l 100 0{\\p0}")).toBe("p1m 0 0 l 100 0p0");
    expect(sanitizeCaptionWord("line\nbreak")).toBe("line break");
    expect(sanitizeCaptionWord("x".repeat(500))).toHaveLength(120);
  });
});

describe("validation", () => {
  it("rejects a fontSize large enough to be a libass memory bomb", async () => {
    const { subtitleStyleOverrideSchema } = await import("./autoclip-rerender");
    expect(subtitleStyleOverrideSchema.safeParse({ fontSize: 1e9 }).success).toBe(false);
    expect(subtitleStyleOverrideSchema.safeParse({ fontSize: 80 }).success).toBe(true);
  });

  it("rejects a malformed ASS colour", async () => {
    const { subtitleStyleOverrideSchema } = await import("./autoclip-rerender");
    expect(subtitleStyleOverrideSchema.safeParse({ baseColor: "red" }).success).toBe(false);
    expect(subtitleStyleOverrideSchema.safeParse({ baseColor: "&H00FFFFFF" }).success).toBe(true);
  });

  it("bounds the transcript array", async () => {
    const { transcriptSchema } = await import("./autoclip-rerender");
    const huge = Array.from({ length: 20_001 }, () => ({ word: "a", start: 0, end: 1 }));
    expect(transcriptSchema.safeParse(huge).success).toBe(false);
  });
});

describe("requestRerender billing", () => {
  it("makes the first re-render of a clip free", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    const res = await requestRerender({ ...base(), patch: {} });
    expect(res).toMatchObject({ ok: true, creditsCharged: 0 });
    expect(spendCredits).not.toHaveBeenCalled();
    expect(clip.rerenderCount).toBe(1);
  });

  it("charges every re-render after the first", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    clip.rerenderCount = 1;
    const res = await requestRerender({ ...base(), patch: {} });
    expect(res).toMatchObject({ ok: true, creditsCharged: 1 });
    expect(spendCredits).toHaveBeenCalledTimes(1);
  });

  // The regression this module exists for: style/transcript used to be free
  // forever, so five rapid "Apply" clicks were five free renders.
  it("charges 4 of 5 sequential applies (only the first is free)", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    let charged = 0;
    for (let i = 0; i < 5; i++) {
      clip.status = "ready"; // the render completes between clicks
      const res = await requestRerender({ ...base(), patch: { subtitleStyleOverride: { fontSize: 70 } } });
      if (res.ok) charged += res.creditsCharged;
    }
    expect(charged).toBe(4);
  });

  it("rejects a second concurrent request instead of charging twice", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    const [a, b] = await Promise.all([
      requestRerender({ ...base(), patch: {} }),
      requestRerender({ ...base(), patch: {} }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect((a.ok ? b : a) as { status: number }).toMatchObject({ status: 409 });
  });

  it("refunds and releases the claim when enqueueing fails", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    clip.rerenderCount = 1; // so it actually costs something
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    const res = await requestRerender({ ...base(), patch: {} });
    expect(res).toMatchObject({ ok: false, status: 500 });
    expect(restoreSpend).toHaveBeenCalledTimes(1);
    expect(clip.status).toBe("ready");
  });

  it("returns 402 rather than queueing when credits are short", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    clip.rerenderCount = 1;
    spendCredits.mockResolvedValueOnce({ ok: false as const, balances: { total: 0 } } as never);
    const res = await requestRerender({ ...base(), patch: {} });
    expect(res).toMatchObject({ ok: false, status: 402 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(clip.status).toBe("ready");
  });
});

describe("requestRerender patching", () => {
  it("drops stale crop keyframes when the aspect ratio changes", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    await requestRerender({ ...base(), patch: { aspectRatio: "16:9" } });
    expect(lastUpdate).toHaveProperty("cropKeyframes");
  });

  it("drops stale crop keyframes when the in/out window changes", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    await requestRerender({ ...base(), patch: { startSec: 5, endSec: 15 } });
    expect(lastUpdate).toHaveProperty("cropKeyframes");
  });

  it("keeps crop keyframes when only the caption style changes", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    await requestRerender({ ...base(), patch: { subtitleStyleOverride: { fontSize: 64 } } });
    expect(lastUpdate).not.toHaveProperty("cropKeyframes");
  });

  it("rejects a clip longer than the max length", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    const res = await requestRerender({ ...base(), patch: { startSec: 0, endSec: 900 } });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("sanitises transcript words on the way in", async () => {
    const { requestRerender } = await import("./autoclip-rerender");
    await requestRerender({ ...base(), patch: { transcript: [{ word: "{\\b1}bold", start: 0, end: 100 }] } });
    expect((lastUpdate!.transcriptJson as { word: string }[])[0].word).toBe("b1bold");
  });
});

describe("refundFailedRerender", () => {
  it("refunds the charge and gives back the consumed free iteration", async () => {
    const { refundFailedRerender } = await import("./autoclip-rerender");
    clip.rerenderCount = 2;
    await refundFailedRerender("clip-1");
    expect(restoreSpend).toHaveBeenCalledWith(
      expect.objectContaining({ refId: "auto-clip-rerender:clip-1:1" }),
    );
    expect(clip.rerenderCount).toBe(1);
  });

  it("never drives rerenderCount below zero", async () => {
    // The queue retries a throwing rerenderJob (attempts:3) and every attempt
    // refunds, so an unguarded decrement went negative — after which `attempt`
    // (rerenderCount - 1) no longer named the refId the charge was under.
    const { refundFailedRerender } = await import("./autoclip-rerender");
    clip.rerenderCount = 0;
    await refundFailedRerender("clip-1");
    await refundFailedRerender("clip-1");
    expect(clip.rerenderCount).toBe(0);
  });

  it("uses a refId the worker can reconstruct (not a timestamp)", async () => {
    const { rerenderRefId } = await import("./autoclip-rerender");
    expect(rerenderRefId("clip-9", 3)).toBe("auto-clip-rerender:clip-9:3");
  });
});
