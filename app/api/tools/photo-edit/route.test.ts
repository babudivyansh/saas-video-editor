import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

// Photo Edit route: what is refused before any charge, how Auto routes without
// Gemini (keyword fallback), what reaches fal, and that a failure refunds the
// full multi-image price.

let tier: "free" | "creator" | "pro" | "studio" = "free";
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: vi.fn(async () => tier),
}));
// No GEMINI key: Auto uses the keyword fallback, so routing is deterministic.
vi.mock("@/lib/env", () => ({ env: { FAL_KEY: "test-fal-key" } }));

const chargeCredits = vi.fn();
const refundCredits = vi.fn();
const markGenerationStatus = vi.fn();
vi.mock("@/lib/credits", () => ({
  chargeCredits: (...a: unknown[]) => chargeCredits(...a),
  refundCredits: (...a: unknown[]) => refundCredits(...a),
  markGenerationStatus: (...a: unknown[]) => markGenerationStatus(...a),
  updateGenerationProgress: vi.fn(),
}));

const assets: Record<string, { id: string; name: string; s3Key: string; mimeType: string; kind: string; size: bigint }> = {
  a1: { id: "a1", name: "beach.jpg", s3Key: "uploads/u1/beach.jpg", mimeType: "image/jpeg", kind: "image", size: 1000n },
  v1: { id: "v1", name: "clip.mp4", s3Key: "uploads/u1/clip.mp4", mimeType: "video/mp4", kind: "video", size: 1000n },
};
const generationUpdate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => (where.userId === "u1" ? assets[where.id] ?? null : null)) },
    generation: { update: (...a: unknown[]) => generationUpdate(...a) },
  },
}));

const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366aa" } }).jpeg().toBuffer();
vi.mock("@/utils/s3-upload", () => ({ downloadS3ObjectToBuffer: vi.fn(async () => photo) }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn(async (u: string) => `${u}?signed`) }));

let capAllowed = true;
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: capAllowed, remaining: 0 })) }));
vi.mock("@/lib/model-overrides", () => ({ getModelOverrides: vi.fn(async () => ({})) }));

const falUpload = vi.fn(async () => "https://v3.fal.media/files/in.jpg");
vi.mock("@fal-ai/client", () => ({ fal: { config: vi.fn(), storage: { upload: () => falUpload() } } }));
const fetchMock = vi.fn<typeof fetch>();

vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
const auditEvent = vi.fn(async () => {});
vi.mock("@/lib/admin/audit", () => ({ auditEvent: (...a: unknown[]) => auditEvent(...a) }));
vi.mock("@/lib/job-routes", () => ({
  createJobStatusHandler: () => vi.fn(),
  createJobCancelHandler: () => vi.fn(),
  idempotencyResponse: () => null,
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
let saved = 0;
const saveToolResult = vi.fn(async () => ({ url: `https://bucket.s3.amazonaws.com/tool-results/u1/out${++saved}.png`, assetId: `asset-out-${saved}` }));
vi.mock("@/lib/tool-results", () => ({ saveToolResult: (...a: unknown[]) => saveToolResult(...a) }));

const { POST } = await import("./route");

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest("http://localhost/api/tools/photo-edit", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type JobView = { status: string; error?: string; meta?: Record<string, unknown> };
const jobsMap = () => (globalThis as unknown as { __photoEditJobs: Map<string, JobView> }).__photoEditJobs;

const outPng = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ff0000" } }).png().toBuffer();

/** fal answers one endpoint with `count` output images; records what was submitted. */
function falCompletes(endpoint: string, count = 1) {
  const submitted: Record<string, unknown>[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === `https://queue.fal.run/${endpoint}` && init?.method === "POST") {
      submitted.push(JSON.parse(String(init.body)));
      return json({ request_id: "r1" });
    }
    if (url.endsWith("/requests/r1/status")) return json({ status: "COMPLETED" });
    if (url.endsWith("/requests/r1")) return json({ images: Array.from({ length: count }, (_, i) => ({ url: `https://v3.fal.media/files/out${i}.png` })) });
    if (url.startsWith("https://v3.fal.media/files/out")) return new Response(new Uint8Array(outPng));
    return new Response("", { status: 404 });
  });
  return submitted;
}

beforeEach(() => {
  tier = "free";
  capAllowed = true;
  saved = 0;
  vi.clearAllMocks();
  chargeCredits.mockResolvedValue({ ok: true, generationId: "g1" });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({ status: "IN_QUEUE" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("POST /api/tools/photo-edit — refused before any charge", () => {
  it("refuses a sexual instruction with 422", async () => {
    const res = await post({ assetId: "a1", prompt: "make her naked" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("policy_blocked");
    expect(chargeCredits).not.toHaveBeenCalled();
    expect(auditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "u1", actorType: "user", action: "photo_edit.blocked", after: expect.objectContaining({ stage: "keyword", prompt: "make her naked" }),
    }));
  });

  it("refuses a photo that isn't the user's", async () => {
    const res = await post({ assetId: "someone-else", prompt: "brighten it" });
    expect(res.status).toBe(404);
    expect(chargeCredits).not.toHaveBeenCalled();
  });

  it("refuses a video asset", async () => {
    const res = await post({ assetId: "v1", prompt: "brighten it" });
    expect(res.status).toBe(400);
    expect(chargeCredits).not.toHaveBeenCalled();
  });

  it("gates a Pro model on the free plan", async () => {
    const res = await post({ assetId: "a1", prompt: "brighten it", model: "edit-nano-banana-2" });
    expect(res.status).toBe(403);
    expect((await res.json()).requiredTier).toBe("pro");
    expect(chargeCredits).not.toHaveBeenCalled();
  });

  it("needs a ratio to expand", async () => {
    const res = await post({ assetId: "a1", action: "expand" });
    expect(res.status).toBe(400);
    expect(chargeCredits).not.toHaveBeenCalled();
  });

  it("stops a free user at the daily cap", async () => {
    capAllowed = false;
    const res = await post({ assetId: "a1", prompt: "brighten it" });
    expect(res.status).toBe(429);
    expect(chargeCredits).not.toHaveBeenCalled();
  });
});

describe("POST /api/tools/photo-edit — runs", () => {
  it("routes a text change to Qwen on Auto, sends the photo, and records the chain", async () => {
    const submitted = falCompletes("fal-ai/qwen-image-2/edit");
    const res = await post({ assetId: "a1", prompt: 'Change the sign to say "SALE"', chainId: "chain-12345678" });
    expect(res.status).toBe(202);
    const body = await res.json() as { jobId: string; model: string; credits: number };
    expect(body).toMatchObject({ model: "edit-qwen-2", credits: 2 });
    await vi.waitFor(() => expect(jobsMap().get(body.jobId)?.status).toBe("done"), { timeout: 10_000, interval: 50 });

    expect(chargeCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: 2, toolSlug: "photo-edit", log: expect.objectContaining({ modelId: "edit-qwen-2" }) }));
    expect(submitted[0]).toMatchObject({ prompt: 'Change the sign to say "SALE"', image_urls: ["https://v3.fal.media/files/in.jpg"], enable_prompt_expansion: false });
    expect(saveToolResult).toHaveBeenCalledWith(expect.objectContaining({ toolSlug: "photo-edit", mimeType: "image/png", name: "beach-edited.png" }));
    expect(generationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "g1" },
      data: expect.objectContaining({ resultAssetId: "asset-out-1", result: expect.objectContaining({ chainId: "chain-12345678", sourceAssetId: "a1", model: "edit-qwen-2" }) }),
    }));
    expect(jobsMap().get(body.jobId)?.meta?.images).toEqual([{ url: "https://bucket.s3.amazonaws.com/tool-results/u1/out1.png?signed", assetId: "asset-out-1" }]);
    expect(refundCredits).not.toHaveBeenCalled();
  }, 15_000);

  it("charges per variation and asks fal for that many images", async () => {
    tier = "creator";
    const submitted = falCompletes("fal-ai/flux-pro/kontext", 3);
    const res = await post({ assetId: "a1", prompt: "turn it into a watercolor painting", model: "edit-flux-kontext", variations: 3 });
    const { jobId } = await res.json() as { jobId: string };
    await vi.waitFor(() => expect(jobsMap().get(jobId)?.status).toBe("done"), { timeout: 10_000, interval: 50 });
    expect(chargeCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: 6 }));
    expect(submitted[0]).toMatchObject({ image_url: "https://v3.fal.media/files/in.jpg", num_images: 3 });
    expect(saveToolResult).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("expands onto a padded canvas with a mask through FLUX Fill", async () => {
    const submitted = falCompletes("fal-ai/flux-pro/v1/fill");
    const res = await post({ assetId: "a1", action: "expand", ratio: "9:16" });
    const { jobId } = await res.json() as { jobId: string };
    await vi.waitFor(() => expect(jobsMap().get(jobId)?.status).toBe("done"), { timeout: 10_000, interval: 50 });
    expect(falUpload).toHaveBeenCalledTimes(2); // canvas + mask
    expect(submitted[0]).toMatchObject({ image_url: expect.any(String), mask_url: expect.any(String), output_format: "png" });
  }, 15_000);

  it("refunds the whole price when fal fails", async () => {
    tier = "creator";
    fetchMock.mockImplementation(async () => new Response('{"detail":"User is locked. Reason: Exhausted balance."}', { status: 403 }));
    const res = await post({ assetId: "a1", prompt: "turn it into anime", model: "edit-flux-kontext", variations: 2 });
    const { jobId } = await res.json() as { jobId: string };
    await vi.waitFor(() => expect(jobsMap().get(jobId)?.status).toBe("error"), { timeout: 10_000, interval: 50 });
    expect(refundCredits).toHaveBeenCalledWith({ userId: "u1", amount: 4, generationId: "g1" });
    expect(saveToolResult).not.toHaveBeenCalled();
  }, 15_000);
});
