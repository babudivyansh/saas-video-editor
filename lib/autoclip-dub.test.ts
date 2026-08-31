// Regression: dubJob's catch block used to mark the ClipDub row "failed" and
// stop — the DUB_CREDIT_COST already spent when the dub was enqueued was
// never refunded, unlike every other ElevenLabs-backed tool (voiceover,
// voice-changer, enhance-speech, AutoClip pick/rerender all refund on
// failure). Fixed by threading userId + the spend's own refId through
// DubPayload so the catch block can call restoreSpend.

import { beforeEach, describe, expect, it, vi } from "vitest";

const restoreSpend = vi.fn(async () => 1);
vi.mock("@/lib/credits", () => ({ restoreSpend: (...a: unknown[]) => restoreSpend(...(a as [])) }));

const clipDubUpdate = vi.fn(async () => ({}));
let dubRow: { id: string; targetLang: string; clip: Record<string, unknown> } | null;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipDub: {
      findUnique: vi.fn(async () => dubRow),
      update: (...a: unknown[]) => clipDubUpdate(...a),
    },
  },
}));

const startDubbing = vi.fn(async () => { throw new Error("ElevenLabs dubbing job failed"); });
vi.mock("@/utils/elevenlabs", () => ({
  startDubbing: (...a: unknown[]) => startDubbing(...a),
  getDubbingStatus: vi.fn(async () => "dubbed"),
  getDubbedAudio: vi.fn(async () => Buffer.from("")),
}));

vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async () => {}) }));
vi.mock("@/utils/ffmpeg-render", () => ({
  runFFmpegArgs: vi.fn(async () => {}),
  styleIndexToSubtitleStyle: vi.fn(() => ({})),
  generateASS: vi.fn(() => {}),
}));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn(async () => "https://cdn.example/out.mp4") }));
vi.mock("@/lib/caption-translate", () => ({ translateTranscript: vi.fn(async (w: unknown) => w) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("fs", () => ({
  default: { existsSync: () => false, writeFileSync: () => {}, unlinkSync: () => {} },
  existsSync: () => false,
  writeFileSync: () => {},
  unlinkSync: () => {},
}));

const { dubJob } = await import("./autoclip-dub");

beforeEach(() => {
  vi.clearAllMocks();
  dubRow = {
    id: "dub1",
    targetLang: "es",
    clip: { videoUrl: "https://cdn.example/clip.mp4", hasCaptions: false, transcriptJson: null, projectId: "proj1", index: 0, captionStyleIndex: 0, subtitleStyleOverride: null },
  };
});

describe("dubJob — refund on failure", () => {
  it("refunds the exact refId the route spent against when the ElevenLabs call fails", async () => {
    await dubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "auto-clip-dub:clip1:123" });

    expect(restoreSpend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", refId: "auto-clip-dub:clip1:123" }),
    );
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "failed" } });
  });

  it("marks the row failed even if the refund itself throws", async () => {
    restoreSpend.mockRejectedValueOnce(new Error("ledger unavailable"));
    await dubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "auto-clip-dub:clip1:123" });
    expect(clipDubUpdate).toHaveBeenCalledWith({ where: { id: "dub1" }, data: { status: "failed" } });
  });
});
