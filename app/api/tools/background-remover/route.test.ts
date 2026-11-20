import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level regression test for the Background Remover migration off its
// old flat, tier-agnostic 10MB constant onto the shared upload-policy
// resolver (Upload Limits Audit §9/§18) — background-remover has no
// feature-access gate and no provider term, so its effective cap is simply
// min(planMaxBytes, 10MB), i.e. always 10MB today (every tier's plan cap
// exceeds it) — this test exists to prove the route actually calls the
// shared resolver end-to-end, not just that the resolver itself is correct
// (already covered by lib/upload-policy.test.ts).

let tier: "free" | "creator" | "pro" | "studio" = "free";
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: vi.fn(async () => tier),
}));

vi.mock("@/lib/env", () => ({ env: { FAL_KEY: "test-fal-key" } }));

const chargeCredits = vi.fn(async () => ({ ok: true, generationId: "g1" }));
const refundCredits = vi.fn();
const markGenerationStatus = vi.fn();
vi.mock("@/lib/credits", () => ({
  chargeCredits: (...a: unknown[]) => chargeCredits(...a),
  refundCredits: (...a: unknown[]) => refundCredits(...a),
  markGenerationStatus: (...a: unknown[]) => markGenerationStatus(...a),
  updateGenerationProgress: vi.fn(),
}));

// The real lib/fal.ts runs; only the network under it is faked.
const falUpload = vi.fn(async () => "https://v3.fal.media/files/in.png");
vi.mock("@fal-ai/client", () => ({ fal: { config: vi.fn(), storage: { upload: () => falUpload() } } }));
const fetchMock = vi.fn<typeof fetch>();

vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
vi.mock("@/lib/job-routes", () => ({
  createJobStatusHandler: () => vi.fn(),
  createJobCancelHandler: () => vi.fn(),
  idempotencyResponse: () => null,
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("fs", () => ({ default: { writeFileSync: vi.fn(), unlinkSync: vi.fn(), readFileSync: vi.fn(() => Buffer.from("png")) } }));
const saveToolResult = vi.fn(async () => ({ url: null, assetId: null }));
vi.mock("@/lib/tool-results", () => ({ saveToolResult: (...a: unknown[]) => saveToolResult(...a) }));

const { POST } = await import("./route");

function imageRequest(bytes: number): NextRequest {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/tools/background-remover", { method: "POST", body: form });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  tier = "free";
  vi.clearAllMocks();
  chargeCredits.mockResolvedValue({ ok: true, generationId: "g1" });
  falUpload.mockResolvedValue("https://v3.fal.media/files/in.png");
  // Default: fal never finishes. Tests that need a run set their own answers.
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({ status: "IN_QUEUE" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

type JobView = { status: string; error?: string; finalizing?: boolean; refunded: boolean };
const jobsMap = () => (globalThis as unknown as { __bgRemoverJobs: Map<string, JobView> }).__bgRemoverJobs;

describe("POST /api/tools/background-remover — effective upload policy", () => {
  it("rejects an image over the 10MB feature cap, before charging credits, on every tier", async () => {
    for (const t of ["free", "creator", "pro", "studio"] as const) {
      tier = t;
      const res = await POST(imageRequest(10 * 1024 * 1024 + 1));
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.limitingFactor).toBe("feature");
      expect(chargeCredits).not.toHaveBeenCalled();
    }
  });

  it("accepts an image at exactly the 10MB cap", async () => {
    tier = "studio";
    const res = await POST(imageRequest(10 * 1024 * 1024));
    expect(res.status).not.toBe(413);
    expect(chargeCredits).toHaveBeenCalled();
    // The Generation is what the phone app follows (GET /api/mobile/v1/jobs/gen_<id>).
    expect(await res.json()).toMatchObject({ generationId: "g1" });
  });
});

describe("POST /api/tools/background-remover — the fal.ai run", () => {
  it("uploads, submits rembg, follows fal's status URL and saves a transparent PNG", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://queue.fal.run/fal-ai/imageutils/rembg" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ image_url: "https://v3.fal.media/files/in.png" });
        // No status_url: the route must build it without the /rembg sub-path.
        return json({ request_id: "r1" });
      }
      if (url === "https://queue.fal.run/fal-ai/imageutils/requests/r1/status") return json({ status: "COMPLETED" });
      if (url === "https://queue.fal.run/fal-ai/imageutils/requests/r1") return json({ image: { url: "https://v3.fal.media/files/out.png" } });
      if (url === "https://v3.fal.media/files/out.png") return new Response(new Uint8Array([137, 80, 78, 71]));
      return new Response("", { status: 405 }); // e.g. the old .../rembg/requests/r1/status
    });

    const res = await POST(imageRequest(1024));
    const { jobId } = await res.json() as { jobId: string };
    await vi.waitFor(() => expect(jobsMap().get(jobId)?.status).toBe("done"), { timeout: 10_000, interval: 50 });

    expect(falUpload).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("storage.fal.run"))).toBe(false);
    expect(saveToolResult).toHaveBeenCalledWith(expect.objectContaining({ toolSlug: "background-remover", mimeType: "image/png", name: "photo-no-bg.png", generationId: "g1" }));
    expect(markGenerationStatus).toHaveBeenCalledWith("g1", "completed");
    expect(refundCredits).not.toHaveBeenCalled();
  }, 15_000);

  it("fails and refunds when fal refuses the job (e.g. an exhausted balance)", async () => {
    fetchMock.mockImplementation(async () => new Response('{"detail":"User is locked. Reason: Exhausted balance."}', { status: 403 }));
    const res = await POST(imageRequest(1024));
    const { jobId } = await res.json() as { jobId: string };
    await vi.waitFor(() => expect(jobsMap().get(jobId)?.status).toBe("error"), { timeout: 10_000, interval: 50 });
    expect(refundCredits).toHaveBeenCalledWith({ userId: "u1", amount: 1, generationId: "g1" });
    expect(markGenerationStatus).toHaveBeenCalledWith("g1", "failed", expect.stringContaining("403"));
    expect(saveToolResult).not.toHaveBeenCalled();
  }, 15_000);
});
