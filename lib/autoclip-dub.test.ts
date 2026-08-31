// dubJob used to be one function that started the ElevenLabs job, polled it
// for up to 10 minutes, then did the post-processing — pinning a queue
// worker the whole time. Split (2026-09-01, ElevenLabs backlog Part B) into
// startDubJob (enqueue-time only) and finishDubJob (triggered later by a
// webhook or lib/cron/dub-sweep.ts once ElevenLabs reports "dubbed"), with
// claimAndEnqueueFinish as the shared idempotency guard between those two
// triggers. Regression this still covers: the refund-on-failure fix (a
// DUB_CREDIT_COST spend must always be refunded on failure, at either phase)
// — see the original dubJob version of this file for that history.

import { beforeEach, describe, expect, it, vi } from "vitest";

const restoreSpend = vi.fn(async () => 1);
vi.mock("@/lib/credits", () => ({ restoreSpend: (...a: unknown[]) => restoreSpend(...(a as [])) }));

const clipDubUpdate = vi.fn(async () => ({}));
const clipDubUpdateMany = vi.fn(async () => ({ count: 1 }));
let dubRow: {
  id: string;
  targetLang: string;
  dubbingId: string | null;
  clip: Record<string, unknown>;
} | null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipDub: {
      findUnique: vi.fn(async () => dubRow),
      update: (...a: unknown[]) => clipDubUpdate(...a),
      updateMany: (...a: unknown[]) => clipDubUpdateMany(...a),
    },
  },
}));

const startDubbing = vi.fn(async () => ({ dubbingId: "el-dub-1" }));
const getDubbingStatus = vi.fn(async () => "dubbed" as "dubbing" | "dubbed" | "failed");
const getDubbedAudio = vi.fn(async () => Buffer.from("audio"));
const forcedAlign = vi.fn(async () => [{ word: "hola", start: 0, end: 200 }]);
vi.mock("@/utils/elevenlabs", () => ({
  startDubbing: (...a: unknown[]) => startDubbing(...a),
  getDubbingStatus: (...a: unknown[]) => getDubbingStatus(...a),
  getDubbedAudio: (...a: unknown[]) => getDubbedAudio(...a),
  forcedAlign: (...a: unknown[]) => forcedAlign(...a),
}));

const dubFinishEnqueue = vi.fn(async () => {});
vi.mock("@/lib/render-queue", () => ({
  createRenderQueue: () => ({ enqueue: dubFinishEnqueue }),
}));

vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async () => {}) }));
vi.mock("@/utils/ffmpeg-render", () => ({
  runFFmpegArgs: vi.fn(async () => {}),
  styleIndexToSubtitleStyle: vi.fn(() => ({})),
  generateASS: vi.fn(() => {}),
}));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn(async () => "https://cdn.example/out.mp4") }));
const translateTranscript = vi.fn(async (w: unknown) => w);
vi.mock("@/lib/caption-translate", () => ({ translateTranscript: (...a: unknown[]) => translateTranscript(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("fs", () => ({
  default: { existsSync: () => false, writeFileSync: () => {}, unlinkSync: () => {} },
  existsSync: () => false,
  writeFileSync: () => {},
  unlinkSync: () => {},
}));

const { startDubJob, finishDubJob, claimAndEnqueueFinish } = await import("./autoclip-dub");

beforeEach(() => {
  vi.clearAllMocks();
  startDubbing.mockResolvedValue({ dubbingId: "el-dub-1" });
  getDubbingStatus.mockResolvedValue("dubbed");
  getDubbedAudio.mockResolvedValue(Buffer.from("audio"));
  forcedAlign.mockResolvedValue([{ word: "hola", start: 0, end: 200 }]);
  translateTranscript.mockImplementation(async (w: unknown) => w);
  clipDubUpdateMany.mockResolvedValue({ count: 1 });
  dubRow = {
    id: "dub1",
    targetLang: "es",
    dubbingId: null,
    clip: {
      videoUrl: "https://cdn.example/clip.mp4",
      hasCaptions: false,
      transcriptJson: null,
      projectId: "proj1",
      index: 0,
      captionStyleIndex: 0,
      subtitleStyleOverride: null,
    },
  };
});

describe("startDubJob", () => {
  it("starts the ElevenLabs job and persists the dubbingId", async () => {
    await startDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "auto-clip-dub:clip1:123" });

    expect(startDubbing).toHaveBeenCalledWith("https://cdn.example/clip.mp4", "es");
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { dubbingId: "el-dub-1" } });
    expect(restoreSpend).not.toHaveBeenCalled();
  });

  it("is a no-op retry guard when dubbingId is already persisted", async () => {
    dubRow!.dubbingId = "el-dub-existing";
    await startDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });
    expect(startDubbing).not.toHaveBeenCalled();
    expect(clipDubUpdate).not.toHaveBeenCalled();
  });

  it("throws when the ClipDub row doesn't exist", async () => {
    dubRow = null;
    await expect(startDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" })).rejects.toThrow(
      "ClipDub dub1 not found",
    );
  });

  it("throws when the clip has no rendered video", async () => {
    dubRow!.clip.videoUrl = null;
    await expect(startDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" })).rejects.toThrow(
      /no rendered video/,
    );
  });

  it("refunds and marks failed when startDubbing throws", async () => {
    startDubbing.mockRejectedValueOnce(new Error("ElevenLabs is down"));
    await startDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "auto-clip-dub:clip1:123" });

    expect(restoreSpend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", refId: "auto-clip-dub:clip1:123" }),
    );
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "failed" } });
  });

  it("marks failed even if the refund itself throws", async () => {
    startDubbing.mockRejectedValueOnce(new Error("ElevenLabs is down"));
    restoreSpend.mockRejectedValueOnce(new Error("ledger unavailable"));
    await startDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "failed" } });
  });
});

describe("claimAndEnqueueFinish", () => {
  const dub = { id: "dub1", userId: "u1", refId: "ref1", clip: { projectId: "proj1" } };

  it("claims an unclaimed row and enqueues finishDubJob", async () => {
    clipDubUpdateMany.mockResolvedValueOnce({ count: 1 });
    const claimed = await claimAndEnqueueFinish(dub);

    expect(claimed).toBe(true);
    expect(clipDubUpdateMany).toHaveBeenCalledWith({
      where: { id: "dub1", status: "dubbing" },
      data: { status: "processing" },
    });
    expect(dubFinishEnqueue).toHaveBeenCalledWith("dub1", {
      projectId: "proj1",
      clipDubId: "dub1",
      userId: "u1",
      refId: "ref1",
    });
  });

  it("returns false without enqueueing when another trigger already won the claim race", async () => {
    clipDubUpdateMany.mockResolvedValueOnce({ count: 0 });
    const claimed = await claimAndEnqueueFinish(dub);

    expect(claimed).toBe(false);
    expect(dubFinishEnqueue).not.toHaveBeenCalled();
  });

  it("still claims and enqueues (with empty ids) when userId/refId are missing", async () => {
    clipDubUpdateMany.mockResolvedValueOnce({ count: 1 });
    const claimed = await claimAndEnqueueFinish({ id: "dub2", userId: null, refId: null, clip: { projectId: "proj1" } });

    expect(claimed).toBe(true);
    expect(dubFinishEnqueue).toHaveBeenCalledWith("dub2", {
      projectId: "proj1",
      clipDubId: "dub2",
      userId: "",
      refId: "",
    });
  });
});

describe("finishDubJob", () => {
  beforeEach(() => {
    dubRow!.dubbingId = "el-dub-1";
  });

  it("throws when the ClipDub row doesn't exist", async () => {
    dubRow = null;
    await expect(finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" })).rejects.toThrow(
      "ClipDub dub1 not found",
    );
  });

  it("throws when dubbingId is missing (startDubJob never completed)", async () => {
    dubRow!.dubbingId = null;
    await expect(finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" })).rejects.toThrow(
      /startDubJob never completed/,
    );
  });

  it("reverts the claim back to dubbing when called before ElevenLabs reports dubbed (premature webhook)", async () => {
    getDubbingStatus.mockResolvedValueOnce("dubbing");
    await finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });

    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "dubbing" } });
    expect(restoreSpend).not.toHaveBeenCalled();
  });

  it("refunds and marks failed when ElevenLabs reports the dub itself failed", async () => {
    getDubbingStatus.mockResolvedValueOnce("failed");
    await finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "auto-clip-dub:clip1:123" });

    expect(restoreSpend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", refId: "auto-clip-dub:clip1:123" }),
    );
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "failed" } });
  });

  it("burns in forced-aligned captions and marks ready on the happy path", async () => {
    dubRow!.clip.hasCaptions = true;
    dubRow!.clip.transcriptJson = [{ word: "hello", start: 0, end: 200 }];
    const ffmpeg = await import("@/utils/ffmpeg-render");
    (ffmpeg.generateASS as ReturnType<typeof vi.fn>).mockClear();

    await finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });

    expect(forcedAlign).toHaveBeenCalled();
    expect(ffmpeg.generateASS).toHaveBeenCalledWith(
      [{ word: "hola", start: 0, end: 200 }],
      expect.anything(),
      expect.stringContaining("dub-sub.ass"),
    );
    expect(clipDubUpdate).toHaveBeenCalledWith({
      where: { id: "dub1" },
      data: { status: "ready", videoUrl: "https://cdn.example/out.mp4" },
    });
  });

  it("falls back to the heuristic timing, and still burns in captions, when forcedAlign itself throws", async () => {
    dubRow!.clip.hasCaptions = true;
    dubRow!.clip.transcriptJson = [{ word: "hello", start: 0, end: 200 }];
    forcedAlign.mockRejectedValueOnce(new Error("ElevenLabs forced-alignment error"));
    const ffmpeg = await import("@/utils/ffmpeg-render");
    (ffmpeg.generateASS as ReturnType<typeof vi.fn>).mockClear();

    await finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });

    expect(ffmpeg.generateASS).toHaveBeenCalledWith(
      [{ word: "hello", start: 0, end: 200 }],
      expect.anything(),
      expect.stringContaining("dub-sub.ass"),
    );
    expect(clipDubUpdate).toHaveBeenCalledWith({
      where: { id: "dub1" },
      data: { status: "ready", videoUrl: "https://cdn.example/out.mp4" },
    });
  });

  it("renders without subtitles when translation itself throws, without failing the whole job", async () => {
    dubRow!.clip.hasCaptions = true;
    dubRow!.clip.transcriptJson = [{ word: "hello", start: 0, end: 200 }];
    translateTranscript.mockRejectedValueOnce(new Error("Gemini is down"));

    await finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });

    expect(clipDubUpdate).toHaveBeenCalledWith({
      where: { id: "dub1" },
      data: { status: "ready", videoUrl: "https://cdn.example/out.mp4" },
    });
    expect(restoreSpend).not.toHaveBeenCalled();
  });

  it("refunds and marks failed when post-processing throws", async () => {
    getDubbedAudio.mockRejectedValueOnce(new Error("audio fetch failed"));
    await finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "auto-clip-dub:clip1:123" });

    expect(restoreSpend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", refId: "auto-clip-dub:clip1:123" }),
    );
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "failed" } });
  });

  it("marks failed even if the refund itself throws", async () => {
    getDubbedAudio.mockRejectedValueOnce(new Error("audio fetch failed"));
    restoreSpend.mockRejectedValueOnce(new Error("ledger unavailable"));
    await finishDubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "failed" } });
  });
});
