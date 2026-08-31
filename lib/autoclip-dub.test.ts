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
const forcedAlign = vi.fn(async () => [] as { word: string; start: number; end: number }[]);
vi.mock("@/utils/elevenlabs", () => ({
  startDubbing: (...a: unknown[]) => startDubbing(...a),
  getDubbingStatus: vi.fn(async () => "dubbed"),
  getDubbedAudio: vi.fn(async () => Buffer.from("")),
  forcedAlign: (...a: unknown[]) => forcedAlign(...a),
}));

vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async () => {}) }));
const generateASS = vi.fn(() => {});
vi.mock("@/utils/ffmpeg-render", () => ({
  runFFmpegArgs: vi.fn(async () => {}),
  styleIndexToSubtitleStyle: vi.fn(() => ({})),
  generateASS: (...a: unknown[]) => generateASS(...a),
}));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn(async () => "https://cdn.example/out.mp4") }));
const translateTranscript = vi.fn(async (w: unknown) => w);
vi.mock("@/lib/caption-translate", () => ({ translateTranscript: (...a: unknown[]) => translateTranscript(...(a as [])) }));
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

describe("dubJob — forced alignment on the translated caption timing", () => {
  const words = [{ word: "hola", start: 0, end: 500 }];

  beforeEach(() => {
    startDubbing.mockResolvedValueOnce({ dubbingId: "el-dub-1" });
    dubRow!.clip.hasCaptions = true;
    dubRow!.clip.transcriptJson = words;
  });

  it("uses forcedAlign's result when it returns real timing", async () => {
    translateTranscript.mockResolvedValueOnce(words);
    forcedAlign.mockResolvedValueOnce([{ word: "hola", start: 10, end: 480 }]);

    await dubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });

    expect(forcedAlign).toHaveBeenCalledWith(expect.any(Buffer), "hola");
    expect(generateASS).toHaveBeenCalledWith([{ word: "hola", start: 10, end: 480 }], expect.anything(), expect.anything());
  });

  it("falls back to the heuristic (translateTranscript) timing when forcedAlign returns nothing", async () => {
    translateTranscript.mockResolvedValueOnce(words);
    forcedAlign.mockResolvedValueOnce([]);

    await dubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });

    expect(generateASS).toHaveBeenCalledWith(words, expect.anything(), expect.anything());
  });

  it("falls back to the heuristic timing, and still burns in captions, when forcedAlign itself throws", async () => {
    translateTranscript.mockResolvedValueOnce(words);
    forcedAlign.mockRejectedValueOnce(new Error("ElevenLabs forced-alignment error: 500"));

    await dubJob({ projectId: "proj1", clipDubId: "dub1", userId: "u1", refId: "ref1" });

    expect(generateASS).toHaveBeenCalledWith(words, expect.anything(), expect.anything());
    // A forced-alignment failure must not trip the outer catch that disables
    // captions entirely — the row should still end up "ready", not "failed".
    expect(clipDubUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ready" }) }));
  });
});
