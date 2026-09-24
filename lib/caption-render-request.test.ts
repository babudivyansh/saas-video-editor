// @vitest-environment node
//
// The money half of requestCaptionRender: that a refund can only ever touch
// the request it belongs to.
//
// Every render of one clip at one caption revision used to spend under the
// SAME refId. restoreSpend with no amount returns everything held under a
// refId, so:
//   - the losing half of a double-click refunded the WINNER's charge too,
//     making a paid provider render free; and
//   - a failed render with template B refunded a completed render with A.
// This runs the real function against an in-memory ledger to pin both.
import { beforeEach, describe, expect, it, vi } from "vitest";

const held = new Map<string, number>();
const spentRefIds: string[] = [];
vi.mock("@/lib/credits", () => ({
  spendCredits: vi.fn(async ({ refId, amount }: { refId: string; amount: number }) => {
    spentRefIds.push(refId);
    held.set(refId, (held.get(refId) ?? 0) + amount);
    return { ok: true, balances: { total: 100 } };
  }),
  restoreSpend: vi.fn(async ({ refId, amount }: { refId: string; amount?: number }) => {
    const net = held.get(refId) ?? 0;
    const give = Math.min(net, amount ?? Number.MAX_SAFE_INTEGER);
    held.set(refId, net - give);
    return give;
  }),
  logToolGeneration: vi.fn(async () => {}),
}));

const create = vi.fn();
const findUnique = vi.fn(async (_a: unknown) => null as unknown);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    captionRenderJob: {
      findUnique: (a: unknown) => findUnique(a),
      findFirst: vi.fn(async () => null),
      create: (a: unknown) => create(a),
      update: vi.fn(async () => ({})),
    },
    config: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("@/lib/captions/renderSource", async (orig) => ({
  ...(await orig<typeof import("@/lib/captions/renderSource")>()),
  resolveRenderSource: vi.fn(async () => ({
    owner: { type: "clip", id: "clip_1" }, ready: true, durationSec: 30, projectId: "proj_1",
  })),
}));
vi.mock("@/lib/captions/templateRegistry", () => ({ resolveCaptionTemplate: vi.fn(async () => ({ providerTemplateId: "t" })) }));
vi.mock("@/lib/captions/CaptionRendererFactory", () => ({
  getCaptionRenderer: vi.fn(async () => ({ renderer: { paid: true, id: "submagic" } })),
  getRendererById: vi.fn(),
  getProviderFeatureToggles: vi.fn(async () => ({})),
  areHooksEnabled: vi.fn(async () => false),
}));
vi.mock("@/lib/render-queue", () => ({
  createRenderQueue: () => ({ enqueue: vi.fn(async () => {}), driver: "in-process" }),
  NonRetryableError: class NonRetryableError extends Error {},
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserTier: vi.fn(async () => "pro") }));
vi.mock("@/lib/asset-service", () => ({ adoptExistingS3Object: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { SUBMAGIC_API_KEY: "sk-test", NEXT_PUBLIC_APP_URL: "https://test.local" } }));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn(), getAssetReadUrl: vi.fn(), s3KeyToPublicUrl: (k: string) => k }));
vi.mock("@/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/utils/ffmpeg-render", () => ({ getMediaDurationSec: vi.fn(async () => 30) }));

const { requestCaptionRender, failCaptionRender } = await import("./caption-render-job");

const input = { clipId: "clip_1", userId: "u1", templateId: "viral-bold-01" };
const heldTotal = () => [...held.values()].reduce((a, b) => a + b, 0);

beforeEach(() => {
  vi.clearAllMocks();
  held.clear();
  spentRefIds.length = 0;
  findUnique.mockResolvedValue(null);
});

describe("requestCaptionRender refunds", () => {
  it("the losing half of a double-click refunds only itself — the winner stays paid", async () => {
    // Both requests pass the cheap pre-check (the race), both charge; the
    // UNIQUE insert then lets exactly one through.
    let winner: { id: string; refId: string } | null = null;
    create.mockImplementationOnce(async ({ data }: { data: { refId: string } }) => {
      winner = { id: "job_A", refId: data.refId };
      return winner;
    });
    create.mockImplementationOnce(async () => { throw new Error("Unique constraint failed on idempotencyKey"); });

    const a = await requestCaptionRender(input);
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    const b = await requestCaptionRender(input);

    expect(a.ok && !a.duplicate).toBe(true);
    expect(b.ok && b.duplicate).toBe(true);
    expect(spentRefIds[0]).not.toBe(spentRefIds[1]);
    // One render, one charge — not zero.
    const cost = a.ok ? a.creditsCharged : 0;
    expect(cost).toBeGreaterThan(0);
    expect(heldTotal()).toBe(cost);
    expect(held.get(winner!.refId)).toBe(cost);
  });

  it("a failed render refunds only its own charge, not an earlier completed one", async () => {
    create.mockImplementation(async ({ data }: { data: { refId: string } }) => ({ id: `job_${data.refId}`, ...data }));
    const first = await requestCaptionRender(input);
    const second = await requestCaptionRender({ ...input, templateId: "clean" });
    if (!first.ok || !second.ok) throw new Error("setup");

    await failCaptionRender(
      { id: second.job.id, userId: "u1", refId: second.job.refId, status: "queued" } as never,
      "PROVIDER_ERROR",
      "failed",
    );

    expect(held.get(first.job.refId!)).toBe(first.creditsCharged);
    expect(held.get(second.job.refId!)).toBe(0);
  });
});
