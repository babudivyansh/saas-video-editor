// Exercises editorRenderJob's success and failure paths end-to-end with every
// I/O boundary (Prisma, S3, ffmpeg, downloads, credits) mocked — the parts
// that actually matter for this regression (does a failure persist a
// sanitized failureReason and refund exactly once; does success clear it and
// never refund) are real, not stubbed-through.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const projectUpdates: Record<string, unknown>[] = [];
const projectRow = {
  id: "proj-1",
  userId: "user-1",
  editorDoc: {
    version: 1,
    aspect: "9:16",
    fps: 30,
    tracks: {
      video: [{ id: "v1", type: "video", assetId: "asset-1", timelineStart: 0, duration: 3, srcIn: 0, volume: 1, muted: false }],
      text: [],
      audio: [],
      image: [],
      caption: [],
    },
  },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async () => projectRow),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        projectUpdates.push(data);
        return { ...projectRow, ...data };
      }),
    },
  },
}));

const restoreSpend = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/credits", () => ({ restoreSpend }));

vi.mock("@/lib/render-queue", () => ({ setRenderProgress: vi.fn(async () => {}) }));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn(async () => {}) }));
vi.mock("@/lib/auth", () => ({ getUserTier: vi.fn(async () => "pro") }));
vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async () => {}) }));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn(async () => "https://cdn.example.com/renders/proj-1.mp4") }));
vi.mock("./caption-ass", () => ({ generateCaptionASS: vi.fn() }));
vi.mock("./filtergraph", () => ({
  buildFilterGraph: vi.fn(() => ({ args: ["-y", "-i", "in.mp4", "out.mp4"] })),
  maybeUseFilterScript: vi.fn((result: { args: string[] }) => result.args),
  writeTextFiles: vi.fn(() => new Map()),
}));

// hasAudioStream (internal to render-job.ts) spawns ffmpeg -i via child_process
// directly — fake a child that closes immediately with no audio stream in stderr.
vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const proc = new EventEmitter() as EventEmitter & { stderr: EventEmitter; stdout: EventEmitter; kill: () => void };
    proc.stderr = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.kill = vi.fn();
    setTimeout(() => proc.emit("close", 0), 0);
    return proc;
  }),
}));

// runFFmpegWithProgress is the seam under test: each test decides whether the
// "encode" step succeeds or fails.
let ffmpegShouldFail: Error | null = null;
vi.mock("@/utils/ffmpeg-render", () => ({
  ffmpegBin: "ffmpeg",
  runFFmpegWithProgress: vi.fn(async (_args: string[], onProgress: (pct: number) => void) => {
    if (ffmpegShouldFail) throw ffmpegShouldFail;
    onProgress(50);
    onProgress(100);
  }),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, unlinkSync: vi.fn() }; // don't touch the real filesystem for temp-file cleanup
});

const { editorRenderJob } = await import("./render-job");

describe("editorRenderJob", () => {
  beforeEach(() => {
    projectUpdates.length = 0;
    ffmpegShouldFail = null;
    restoreSpend.mockClear();
  });

  it("on success: marks the project completed with a videoUrl, clears no failureReason (none set), and never refunds", async () => {
    await editorRenderJob({ projectId: "proj-1", assetUrls: { "asset-1": "https://s3.example.com/asset-1.mp4" } });

    const finalUpdate = projectUpdates[projectUpdates.length - 1];
    expect(finalUpdate).toMatchObject({ status: "completed", progress: 100 });
    expect(finalUpdate.videoUrl).toBe("https://cdn.example.com/renders/proj-1.mp4");
    expect(restoreSpend).not.toHaveBeenCalled();
    expect(projectUpdates.some((u) => u.status === "failed")).toBe(false);
  });

  it("on failure: persists a sanitized failureReason (not the raw error text), marks failed, and refunds exactly once", async () => {
    ffmpegShouldFail = new Error(
      "FFmpeg exited 1:\nunknown option -- weird, path was /home/deploy/secret/render-tmp/asset-1.mp4",
    );

    await editorRenderJob({ projectId: "proj-1", assetUrls: { "asset-1": "https://s3.example.com/asset-1.mp4" } });

    const failedUpdate = projectUpdates.find((u) => u.status === "failed");
    expect(failedUpdate).toBeTruthy();
    expect(typeof failedUpdate!.failureReason).toBe("string");
    expect(failedUpdate!.failureReason as string).not.toContain("/home/deploy/secret");
    expect(failedUpdate!.failureReason as string).not.toContain("unknown option");

    expect(restoreSpend).toHaveBeenCalledTimes(1);
    expect(restoreSpend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", refId: "editor-render:proj-1", reason: "refund:editor-render-failed" }),
    );
  });

  it("on failure: never marks the project completed", async () => {
    ffmpegShouldFail = new Error("FFmpeg timed out after 900000ms and was killed");
    await editorRenderJob({ projectId: "proj-1", assetUrls: { "asset-1": "https://s3.example.com/asset-1.mp4" } });
    expect(projectUpdates.some((u) => u.status === "completed")).toBe(false);
  });
});
