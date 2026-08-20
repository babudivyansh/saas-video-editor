import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Table-driven route-level regression test proving every migrated tool route
// (Upload Limits Audit §9, plus the follow-up production-release-gate
// verification) actually calls the shared upload-policy resolver, not a
// hardcoded byte constant. background-remover already has its own dedicated
// test file (app/api/tools/background-remover/route.test.ts) and is
// deliberately NOT duplicated here.
//
// Each route is exercised only on the REJECTION path (a file one byte over
// its effective cap must come back 413/limitingFactor, before any credit
// charge or provider call) — that's the security-relevant behavior this
// migration changed. The accept path for each of these routes was already
// covered by lib/upload-policy.test.ts's exhaustive resolver tests and, for
// one representative route, by background-remover's own accept-path test;
// re-proving every route's full success path (job queue, ffmpeg, fal.ai
// polling) here would just re-test pre-existing, unchanged business logic.

let tier: "free" | "creator" | "pro" | "studio" = "studio"; // studio: only the FEATURE cap can bind, isolating the migration's own logic
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "u1" })),
  getUserTier: vi.fn(async () => tier),
}));
vi.mock("@/lib/env", () => ({
  env: {
    FAL_KEY: "test-fal-key",
    ELEVENLABS_API_KEY: "test-key",
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_S3_BUCKET: "test-bucket",
    AWS_REGION: "us-east-1",
  },
}));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
vi.mock("@/lib/job-routes", () => ({
  createJobStatusHandler: () => vi.fn(),
  createJobCancelHandler: () => vi.fn(),
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })), getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/free-tool-caps", () => ({
  checkFreeToolDailyCap: vi.fn(async () => ({ allowed: true })),
  freeToolCapResponseBody: vi.fn(() => ({})),
}));
const chargeCredits = vi.fn(async () => ({ ok: true, generationId: "g1" }));
vi.mock("@/lib/credits", () => ({
  chargeCredits: (...a: unknown[]) => chargeCredits(...a),
  refundCredits: vi.fn(),
  markGenerationStatus: vi.fn(),
  updateGenerationProgress: vi.fn(),
  checkModelAccess: vi.fn(async () => ({ allowed: true })), // feature-access gating is untouched by this migration — always let it through so the size check is what's under test
}));
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: vi.fn(() => ({})) }));
vi.mock("@/lib/asset-service", () => ({
  adoptUploadedBytes: vi.fn(async () => ({ asset: {}, url: "", key: "", duplicate: false })),
}));
const fsStub = {
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from("x")),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 0 })),
};
vi.mock("fs", () => ({ default: fsStub, ...fsStub }));

function file(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

interface RouteCase {
  label: string;
  modulePath: string;
  feature: string; // matches lib/upload-policy.ts's UploadFeature key, for assertion only
  featureCapBytes: number;
  buildOversizedForm: (overBy: number) => FormData;
}

const CASES: RouteCase[] = [
  {
    label: "Face Swap",
    modulePath: "./face-swap/route",
    feature: "face-swap",
    featureCapBytes: 10 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("characterImage", file(10 * 1024 * 1024 + over, "a.png", "image/png"));
      f.append("targetImage", file(1024, "b.png", "image/png"));
      return f;
    },
  },
  {
    label: "Subtitle Remover",
    modulePath: "./subtitle-remover/route",
    feature: "subtitle-remover",
    featureCapBytes: 500 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("video", file(500 * 1024 * 1024 + over, "v.mp4", "video/mp4"));
      return f;
    },
  },
  {
    label: "Voice Changer",
    modulePath: "./voice-changer/route",
    feature: "voice-changer",
    featureCapBytes: 50 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("audio", file(50 * 1024 * 1024 + over, "a.mp3", "audio/mpeg"));
      return f;
    },
  },
  {
    label: "Vocal Remover",
    modulePath: "./vocal-remover/route",
    feature: "vocal-remover",
    featureCapBytes: 50 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("file", file(50 * 1024 * 1024 + over, "a.mp3", "audio/mpeg"));
      return f;
    },
  },
  {
    label: "Enhance Speech",
    modulePath: "./enhance-speech/route",
    feature: "enhance-speech",
    featureCapBytes: 50 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("file", file(50 * 1024 * 1024 + over, "a.mp3", "audio/mpeg"));
      return f;
    },
  },
  {
    label: "Audio Balancer",
    modulePath: "./audio-balancer/route",
    feature: "audio-balancer",
    featureCapBytes: 500 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("file", file(500 * 1024 * 1024 + over, "a.mp3", "audio/mpeg"));
      return f;
    },
  },
  {
    label: "MP3 Converter",
    modulePath: "./mp3-converter/route",
    feature: "mp3-converter",
    featureCapBytes: 500 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("file", file(500 * 1024 * 1024 + over, "a.mp4", "video/mp4"));
      return f;
    },
  },
  {
    label: "Video Compressor",
    modulePath: "./video-compressor/route",
    feature: "video-compressor",
    featureCapBytes: 500 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("file", file(500 * 1024 * 1024 + over, "a.mp4", "video/mp4"));
      return f;
    },
  },
  {
    label: "Cut & Crop",
    modulePath: "./cut-and-crop/route",
    feature: "cut-and-crop",
    featureCapBytes: 500 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("trims", JSON.stringify([{ start: 0, end: 1 }]));
      f.append("crop", "original");
      f.append("file_0", file(500 * 1024 * 1024 + over, "a.mp4", "video/mp4"));
      return f;
    },
  },
  {
    label: "Reference Image",
    modulePath: "./upload-reference-image/route",
    feature: "reference-image",
    featureCapBytes: 10 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("image", file(10 * 1024 * 1024 + over, "a.png", "image/png"));
      return f;
    },
  },
  {
    label: "AI Creator (file upload)",
    modulePath: "./ai-creator/route",
    feature: "ai-creator",
    featureCapBytes: 200 * 1024 * 1024,
    buildOversizedForm: (over) => {
      const f = new FormData();
      f.append("video", file(200 * 1024 * 1024 + over, "v.mp4", "video/mp4"));
      return f;
    },
  },
];

beforeEach(() => {
  tier = "studio"; // largest plan cap — isolates the feature-cap term
  vi.clearAllMocks();
  chargeCredits.mockResolvedValue({ ok: true, generationId: "g1" });
});

afterEach(() => {
  vi.resetModules();
});

describe("Migrated tool routes call the shared upload policy (Production Release Gate §5/§6)", () => {
  for (const c of CASES) {
    it(`${c.label}: rejects one byte over its effective cap with limitingFactor, before charging credits`, async () => {
      vi.resetModules();
      const mod = await import(c.modulePath);
      const req = new NextRequest(`http://localhost/api/tools/test`, { method: "POST", body: c.buildOversizedForm(1) });
      const res = await mod.POST(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      // Every migrated route now returns the shared structured error shape
      // (lib/upload-policy.ts's uploadPolicyErrorBody) instead of a bespoke
      // "File too large" string with no machine-readable factor.
      expect(json.limitingFactor).toBe("feature");
      expect(json.featureMaxBytes).toBe(c.featureCapBytes);
      expect(chargeCredits).not.toHaveBeenCalled();
    });
  }
});
