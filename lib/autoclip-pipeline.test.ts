import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { centeredAspectCrop } from "@/lib/crop";

// Stub the queue factory: modules loaded here (e.g. lib/asset-moderation.ts
// via autoclip-pipeline) call createRenderQueue at import time, which would
// otherwise start a live BullMQ worker against REDIS_URL that logs after this
// file finishes and fails the run ("Closing rpc while onUserConsoleLog was pending").
vi.mock("@/lib/render-queue", async () => ({
  createRenderQueue: () => ({ enqueue: async () => {}, driver: "in-process" }),
  NonRetryableError: (await import("@/lib/job-queue")).NonRetryableError,
}));

// autoclip-pipeline.ts pulls in prisma/redis/env/ffmpeg/elevenlabs/Gemini at
// module scope (it's the whole job-orchestration file, not just pure
// helpers) — mock the infra-touching modules so importing it here only
// requires no live DB/Redis/AWS, matching the pattern used by lib/auth.test.ts.
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket", GEMINI_API_KEY: "test" },
}));

let configRow: { key: string; value: string } | null = null;
let clipUpdates: Array<{ where: { id: string }; data: unknown }> = [];
let projectUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
let userRow: { email: string; name: string | null } | null = {
  email: "creator@test.co", name: "Ada",
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: vi.fn(async () => configRow) },
    project: {
      findUnique: vi.fn(async () => ({ id: "project-1", userId: "user-1", uploadedVideoUrl: "https://x/vid.mp4", faceTimeline: null })),
      // P0-3: the failure path now records a sanitized failureReason here.
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => { projectUpdates.push(args); return args; }),
    },
    clip: {
      findUnique: vi.fn(async () => ({ id: "clip-1", projectId: "project-1", status: "queued", startSec: 0, endSec: 10 })),
      update: vi.fn(async (args: { where: { id: string }; data: unknown }) => { clipUpdates.push(args); return args; }),
    },
    user: {
      findUnique: vi.fn(async () => userRow),
    },
  },
}));

// The local face detector, controllable per test (resolveClipFaces below).
// Off by default, so the job-level tests here never decode video for faces.
const localFaces = vi.hoisted(() => ({
  available: false,
  detect: vi.fn(async (..._args: unknown[]) => ({ boxes: [] as unknown[] }) as { boxes: unknown[]; failure?: string }),
}));
vi.mock("@/lib/face-detect-local", () => ({
  localDetectorAvailable: () => localFaces.available,
  detectFacesLocal: (...args: unknown[]) => localFaces.detect(...args),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));

const notify = vi.fn(async () => {});
vi.mock("@/lib/notify", () => ({ notify }));
vi.mock("@/lib/admin/staff-alerts", () => ({ noteAutoClipFailure: vi.fn(async () => {}) }));

const sendClipsReadyEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendClipsReadyEmail }));

vi.mock("@/utils/download", () => ({
  downloadFile: vi.fn(async () => { throw new Error("source unreachable"); }),
}));

// rerenderJob lazily imports this on its failure path (the two modules are a
// deliberate cycle). Importing it for real constructs a render queue and
// reaches for Redis/BullMQ, which has no place in a unit test of error
// handling — the refund's own behaviour is covered by autoclip-rerender.test.ts.
vi.mock("@/lib/autoclip-rerender", () => ({ refundFailedRerender: vi.fn(async () => {}) }));

const {
  sliceWordsForClip, rebaseClipWords, computeCreditCost, getAutoClipPricing, AUTOCLIP_PRICING_DEFAULTS,
  buildBrollFilterComplex, computeKeeps, enforceNonOverlapping, rerenderJob, notifyRenderOutcome,
  wordsOnRenderedTimeline, SOURCE_AUDIO_MAP, fitSegmentToBand, renderFpsCap, pickJob,
} = await import("./autoclip-pipeline");

// CLIPIRO-WEB-20: a 1080p60 source rendered at 60 fps ran at 0.059x realtime.
describe("renderFpsCap", () => {
  it("brings sources above 30 fps down to 30", () => {
    expect(renderFpsCap(59.94, 30)).toBe(30);
    expect(renderFpsCap(60, 30)).toBe(30);
  });
  it("leaves 30 fps and below, and unknown rates, alone", () => {
    for (const fps of [30, 29.97, 25, 24, 0, Number.NaN]) expect(renderFpsCap(fps, 30)).toBeNull();
  });
});

// CLIPIRO-WEB-10: short picks were dropped, emptying the whole run.
describe("fitSegmentToBand", () => {
  it("stretches a pick shorter than minDuration forward", () => {
    expect(fitSegmentToBand(100, 108, 600, 15, 60)).toEqual({ start: 100, end: 115 });
  });
  it("stretches backward at the end of the source", () => {
    expect(fitSegmentToBand(595, 599, 600, 15, 60)).toEqual({ start: 585, end: 600 });
  });
  it("still caps at maxDuration", () => {
    expect(fitSegmentToBand(10, 3600, 4000, 15, 60)).toEqual({ start: 10, end: 70 });
  });
  it("keeps an in-band pick as-is", () => {
    expect(fitSegmentToBand(20, 50, 600, 15, 60)).toEqual({ start: 20, end: 50 });
  });
});

// CLIPIRO-WEB-1V/-C: a project with no source must not be retried.
describe("pickJob on a missing project", () => {
  it("fails permanently and quietly instead of retrying", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null as never);
    const { NonRetryableError } = await import("./job-queue");
    const err = await pickJob({ projectId: "gone" } as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NonRetryableError);
    expect((err as InstanceType<typeof NonRetryableError>).expected).toBe(true);
  });
});

describe("sliceWordsForClip", () => {
  const words = [
    { word: "hello", start: 1000, end: 1400 },
    { word: "world", start: 1500, end: 1900 },
    { word: "outside", start: 20000, end: 20500 },
  ];

  it("keeps only words overlapping the requested window and rebases to clip-relative ms", () => {
    const sliced = sliceWordsForClip(words, 1, 5); // 1s-5s -> 1000ms-5000ms
    expect(sliced).toEqual([
      { word: "hello", start: 0, end: 400 },
      { word: "world", start: 500, end: 900 },
    ]);
  });

  it("returns an empty array when nothing overlaps", () => {
    expect(sliceWordsForClip(words, 100, 200)).toEqual([]);
  });

  it("clamps negative rebased timestamps to 0 for a word that starts before the window", () => {
    const straddling = [{ word: "straddle", start: 900, end: 1500 }];
    const sliced = sliceWordsForClip(straddling, 1, 5);
    expect(sliced[0].start).toBe(0);
  });

  it("carries the diarization speaker label through slicing", () => {
    const withSpeakers = [
      { word: "hello", start: 1000, end: 1400, speaker: "speaker_0" },
      { word: "world", start: 1500, end: 1900, speaker: "speaker_1" },
    ];
    const sliced = sliceWordsForClip(withSpeakers, 1, 5);
    expect(sliced.map((w) => w.speaker)).toEqual(["speaker_0", "speaker_1"]);
  });
});

describe("rebaseClipWords", () => {
  // Original clip was [10s, 20s]; words are stored relative to that (0-10000ms).
  const words = [
    { word: "a", start: 0, end: 400 },
    { word: "b", start: 2000, end: 2400 },
    { word: "c", start: 9000, end: 9500 },
  ];

  it("shifts words when the new start trims the front of the clip", () => {
    // New range [12s, 20s] — old start 10s -> shift = +2000ms
    const rebased = rebaseClipWords(words, 10, 12, 20);
    expect(rebased.map((w) => w.word)).toEqual(["b", "c"]); // "a" (0-400) now fully before 0
    expect(rebased[0]).toEqual({ word: "b", start: 0, end: 400 });
  });

  it("drops words that fall entirely outside the new [start,end) window", () => {
    const rebased = rebaseClipWords(words, 10, 10, 11); // new range only [10s,11s) = [0,1000)ms
    expect(rebased.map((w) => w.word)).toEqual(["a"]);
  });

  it("returns an unchanged (zero-shift) result when start doesn't actually move", () => {
    const rebased = rebaseClipWords(words, 10, 10, 20);
    expect(rebased).toEqual(words);
  });

  it("carries the diarization speaker label through rebasing", () => {
    const withSpeakers = [
      { word: "a", start: 0, end: 400, speaker: "speaker_0" },
      { word: "b", start: 2000, end: 2400, speaker: "speaker_1" },
    ];
    const rebased = rebaseClipWords(withSpeakers, 10, 10, 20);
    expect(rebased.map((w) => w.speaker)).toEqual(["speaker_0", "speaker_1"]);
  });
});

describe("computeCreditCost", () => {
  it("charges per clip plus per 2-minute block for one short clip", () => {
    // 1 clip, 30s -> 1 two-minute block (rounded up)
    expect(computeCreditCost(1, 30, AUTOCLIP_PRICING_DEFAULTS)).toBe(
      AUTOCLIP_PRICING_DEFAULTS.perClip + AUTOCLIP_PRICING_DEFAULTS.perTwoMinutes,
    );
  });

  it("scales with clip count and total duration, not a flat rate", () => {
    const one = computeCreditCost(1, 30, AUTOCLIP_PRICING_DEFAULTS);
    const many = computeCreditCost(10, 300, AUTOCLIP_PRICING_DEFAULTS);
    expect(many).toBeGreaterThan(one);
  });

  it("rounds partial 2-minute blocks up (121s costs for 2 blocks)", () => {
    const cost = computeCreditCost(1, 121, AUTOCLIP_PRICING_DEFAULTS);
    expect(cost).toBe(AUTOCLIP_PRICING_DEFAULTS.perClip + AUTOCLIP_PRICING_DEFAULTS.perTwoMinutes * 2);
  });

  it("respects custom admin-configured rates", () => {
    const custom = { perClip: 2, perTwoMinutes: 3, analysisPerHalfHour: 1, rerender: 1 };
    expect(computeCreditCost(3, 150, custom)).toBe(3 * 2 + 3 * 2); // 3 clips, 2 blocks
  });
});

describe("getAutoClipPricing", () => {
  it("returns defaults when no Config row exists", async () => {
    configRow = null;
    expect(await getAutoClipPricing()).toEqual(AUTOCLIP_PRICING_DEFAULTS);
  });

  it("merges a partial admin-set Config row over the defaults", async () => {
    configRow = { key: "autoclip_pricing", value: JSON.stringify({ perClip: 3 }) };
    expect(await getAutoClipPricing()).toEqual({ ...AUTOCLIP_PRICING_DEFAULTS, perClip: 3 });
  });

  it("falls back to defaults if the stored Config value is corrupt JSON", async () => {
    configRow = { key: "autoclip_pricing", value: "{not valid json" };
    expect(await getAutoClipPricing()).toEqual(AUTOCLIP_PRICING_DEFAULTS);
  });

  // This was a bare spread of the parsed row, so any junk value in it won —
  // and null or a string times a clip count is 0, i.e. every run free.
  it.each([
    ["null", { perClip: null }],
    ["a string", { perClip: "3" }],
    ["zero, which would make every run free", { perClip: 0, perTwoMinutes: 0 }],
    ["a negative", { dubPerMinute: -2 }],
    ["a fraction", { perTwoMinutes: 1.5 }],
  ])("ignores %s and keeps the default for that field", async (_label, stored) => {
    configRow = { key: "autoclip_pricing", value: JSON.stringify(stored) };
    expect(await getAutoClipPricing()).toEqual(AUTOCLIP_PRICING_DEFAULTS);
  });

  it("still allows a free first re-render and a zero analysis advance", async () => {
    configRow = { key: "autoclip_pricing", value: JSON.stringify({ rerender: 0, analysisPerHalfHour: 0 }) };
    expect(await getAutoClipPricing()).toEqual({ ...AUTOCLIP_PRICING_DEFAULTS, rerender: 0, analysisPerHalfHour: 0 });
  });
});

describe("buildBrollFilterComplex", () => {
  it("builds three labeled segments (main, broll, main) plus a concat", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null);
    expect(fc).toContain("[vm0]"); // main before the insert
    expect(fc).toContain("[vb0]"); // the B-roll itself
    expect(fc).toContain("[vm1]"); // main after it
    expect(fc).toContain("concat=n=3:v=1:a=0");
    expect(fc).toContain("[video]");
  });

  it("trims segment A from 0 to the broll start, and segment C from the broll end to the clip's own duration", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null);
    expect(fc).toContain("trim=start=0:end=3");
    expect(fc).toContain("trim=start=5.5:end=10");
  });

  it("scales the broll input to the aspect's target resolution and caps it to the window duration", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null);
    expect(fc).toContain("scale=1080:1920");
    expect(fc).toContain("trim=0:2.5"); // 5.5 - 3
  });

  it("chains mood and caption filters after the concat, not before", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", "eq=saturation=1.5", "subtitles='x.ass'");
    const concatIdx = fc.indexOf("concat=n=3");
    const moodIdx = fc.indexOf("eq=saturation=1.5");
    const capIdx = fc.indexOf("subtitles=");
    expect(moodIdx).toBeGreaterThan(concatIdx);
    expect(capIdx).toBeGreaterThan(moodIdx);
  });

  // The crop is applied ONCE, before the stream is split into the two main
  // segments — not once per segment. `trim` + `setpts=PTS-STARTPTS` rebases t
  // to zero for each segment, so a time-varying crop applied after the trim
  // would replay the beginning of the pan path during segment C rather than
  // continuing it. Cropping first keeps t clip-relative, which is the basis
  // every crop keyframe is expressed in.
  it("crops once up front and splits, rather than cropping each main segment", () => {
    const fc = buildBrollFilterComplex(10, 3, 5.5, "16:9", null, null);
    expect(fc.split(centeredAspectCrop("16:9")).length - 1).toBe(1);
    expect(fc).toContain("split=2[m0][m1]");
    // Both main segments are trimmed from the already-cropped stream.
    expect(fc).toContain("[m0]trim=start=0");
    expect(fc).toContain("[m1]trim=start=5.5");
  });

  // Regression for P2.6: a 2.5s stock insert used to cost the whole clip its
  // speaker tracking, because cropKeyframes were simply not computed for any
  // clip that got B-roll.
  it("carries a dynamic pan path through to the main segments when given one", () => {
    const dynamicCrop = "crop=w='(in_h*9/16)':h='in_h':x='if(lt(t,2),(0.1*in_w),(0.3*in_w))':y='0'";
    const fc = buildBrollFilterComplex(10, 3, 5.5, "9:16", null, null, "[0:v]", dynamicCrop);
    expect(fc).toContain(dynamicCrop);
    // Still exactly one crop, still before the split.
    expect(fc.indexOf(dynamicCrop)).toBeLessThan(fc.indexOf("split=2"));
    expect(fc).not.toContain(centeredAspectCrop("9:16")); // the static fallback is not used
  });
});

describe("computeKeeps filler-word matching", () => {
  it("cuts repeated-letter variants (umm/uhh/erm/hmm), not just the base forms", () => {
    const words = [
      { word: "so", start: 0, end: 200 },
      { word: "umm", start: 200, end: 500 },
      { word: "yeah", start: 500, end: 800 },
    ];
    const { cuts } = computeKeeps(words, 1, false, 400, true);
    expect(cuts).toEqual([{ startMs: 200, endMs: 500 }]);
  });

  it("cuts the two-word phrase 'you know' as a single span, since ASR emits it as two tokens", () => {
    const words = [
      { word: "well", start: 0, end: 300 },
      { word: "you", start: 300, end: 500 },
      { word: "know", start: 500, end: 800 },
      { word: "right", start: 800, end: 1100 },
    ];
    const { cuts } = computeKeeps(words, 2, false, 400, true);
    expect(cuts).toEqual([{ startMs: 300, endMs: 800 }]);
  });

  it("does not cut 'know' on its own when not preceded by 'you'", () => {
    const words = [
      { word: "did", start: 0, end: 200 },
      { word: "you", start: 200, end: 400 },
      { word: "see", start: 400, end: 600 }, // breaks the "you know" bigram
      { word: "know", start: 600, end: 900 },
    ];
    const { cuts } = computeKeeps(words, 2, false, 400, true);
    expect(cuts).toEqual([]);
  });
});

describe("enforceNonOverlapping", () => {
  it("leaves already-sorted, non-overlapping segments untouched", () => {
    const segs = [{ start: 0, end: 10 }, { start: 10, end: 20 }];
    expect(enforceNonOverlapping(segs, 5)).toEqual(segs);
  });

  it("sorts out-of-order segments by start time", () => {
    const segs = [{ start: 10, end: 20 }, { start: 0, end: 8 }];
    const result = enforceNonOverlapping(segs, 5);
    expect(result.map((s) => s.start)).toEqual([0, 10]);
  });

  it("clamps an overlapping segment's start forward to the previous segment's end", () => {
    const segs = [{ start: 0, end: 10 }, { start: 6, end: 20 }];
    const result = enforceNonOverlapping(segs, 5);
    expect(result).toEqual([{ start: 0, end: 10 }, { start: 10, end: 20 }]);
  });

  it("drops a segment entirely if clamping it would leave it shorter than minDuration", () => {
    const segs = [{ start: 0, end: 10 }, { start: 8, end: 12 }]; // clamped to [10,12) = 2s
    const result = enforceNonOverlapping(segs, 5); // min 5s
    expect(result).toEqual([{ start: 0, end: 10 }]);
  });
});

// Regression guard for the Studio & Insights "stuck at Queued forever" bug:
// rerenderJob previously had no catch at all, so any failure (most commonly
// downloadFile, mocked to throw here) left the Clip's status frozen at
// "queued" with nothing to ever move it. It must now flip to "failed" (so the
// atomic claim guard in style/rerender/transcript routes can re-claim it) and
// rethrow (so createRenderQueue's attempts:3/backoff still sees a real failure).
describe("rerenderJob error handling", () => {
  // Explicit timeout: this is the first test to pull rerenderJob's (large)
  // module graph, so its wall time includes a one-off lazy import that the
  // later tests in this block don't pay. Isolated it runs in ~3s, but under a
  // full parallel `npm test` it drifts past the 5s default and flakes. Same
  // reason lib/source-url.tenant-isolation.test.ts pins its own.
  it("flips the clip to failed and rethrows when downloadFile fails", async () => {
    clipUpdates = [];
    projectUpdates = [];
    await expect(rerenderJob({ projectId: "project-1", clipId: "clip-1" })).rejects.toThrow("source unreachable");
    expect(clipUpdates).toContainEqual(
      expect.objectContaining({ where: { id: "clip-1" }, data: expect.objectContaining({ status: "failed" }) }),
    );
  }, 30_000);

  // P0-3: this failure used to leave failureReason null, so a production P0
  // had no diagnosable reason on the record.
  // On the CLIP, not the project: one clip's failed re-render used to put an
  // error banner over a completed project full of good clips.
  it("records a sanitized failureReason on the clip, and leaves the project alone", async () => {
    clipUpdates = [];
    projectUpdates = [];
    await expect(rerenderJob({ projectId: "project-1", clipId: "clip-1" })).rejects.toThrow();
    const reason = (clipUpdates.find((u) => typeof u.data === "object" && u.data !== null && "failureReason" in u.data)
      ?.data as { failureReason?: string } | undefined)?.failureReason;
    expect(reason).toBeTruthy();
    expect(projectUpdates.some((u) => "failureReason" in u.data)).toBe(false);
    // Sanitized: never the raw error, a URL, a signature or a temp path.
    expect(reason).not.toMatch(/source unreachable|https?:|X-Amz|\/tmp\//i);
  });

  // P0-3 billing: refunding AND rethrowing a retryable error made the queue
  // retry, and each retry refunded a different (earlier) refId — the observed
  // 781 → 783. NonRetryableError stops the retry while still failing the run.
  it("throws NonRetryableError so the queue cannot retry a failure it already refunded", async () => {
    const { NonRetryableError } = await import("./job-queue");
    await expect(rerenderJob({ projectId: "project-1", clipId: "clip-1" }))
      .rejects.toBeInstanceOf(NonRetryableError);
  });
});

// An audit found AutoClip's own render pipeline was the one path that never
// sent the "your clips are ready" email — the in-app bell fired, but nothing
// reached the user's inbox for renders that can take minutes. This pins the
// email as part of the same terminal-outcome hook the bell already uses.
describe("notifyRenderOutcome — clips-ready email", () => {
  it("sends the email on a successful completion, with an absolute URL", async () => {
    notify.mockClear();
    sendClipsReadyEmail.mockClear();
    userRow = { email: "creator@test.co", name: "Ada" };

    await notifyRenderOutcome("project-1", "user-1", "completed", { readyCount: 3 });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(sendClipsReadyEmail).toHaveBeenCalledTimes(1);
    const [to, name, readyCount, href] = sendClipsReadyEmail.mock.calls[0];
    expect(to).toBe("creator@test.co");
    expect(name).toBe("Ada");
    expect(readyCount).toBe(3);
    expect(href).toMatch(/^https?:\/\/.+\/dashboard\/projects\/project-1$/);
  });

  it("never sends an email on a failed outcome", async () => {
    notify.mockClear();
    sendClipsReadyEmail.mockClear();

    await notifyRenderOutcome("project-1", "user-1", "failed", { reason: "no clips survived" });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(sendClipsReadyEmail).not.toHaveBeenCalled();
  });

  it("still fires the in-app bell even if the user lookup fails — the email is best-effort, not load-bearing", async () => {
    notify.mockClear();
    sendClipsReadyEmail.mockClear();
    userRow = null; // simulates a lookup miss / DB hiccup

    await expect(notifyRenderOutcome("project-1", "user-1", "completed", { readyCount: 1 })).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(sendClipsReadyEmail).not.toHaveBeenCalled();

    userRow = { email: "creator@test.co", name: "Ada" }; // restore for later tests
  });
});

// The stored transcript stays on the clip's source window so every re-render
// can recompute silence/filler trimming from it. Writing the SHIFTED words
// back (as renders used to) made the next re-render trim already-trimmed
// timings against the untrimmed source: tail cut off, captions drifting
// further on every re-render. This is the shifted VIEW, for anything that
// lays words over the rendered file.
describe("wordsOnRenderedTimeline", () => {
  const words = [
    { word: "hello", start: 0, end: 400 },
    { word: "there", start: 3000, end: 3400 }, // 2.6s of silence before it
  ];

  it("returns the words untouched when trimming is off", () => {
    expect(wordsOnRenderedTimeline(words, 4, { removeSilence: false, removeFillers: false })).toBe(words);
    expect(wordsOnRenderedTimeline(words, 4, null)).toBe(words);
  });

  it("pulls words after a removed silence earlier, by the silence removed", () => {
    const shifted = wordsOnRenderedTimeline(words, 4, { removeSilence: true, silenceThresholdMs: 400 });
    expect(shifted[0].start).toBe(0);
    expect(shifted[1].start).toBeLessThan(3000);
    expect(shifted[1].end - shifted[1].start).toBe(400);
  });

  it("is a view, not a mutation: the same source always gives the same result", () => {
    const opts = { removeSilence: true, silenceThresholdMs: 400 };
    const a = wordsOnRenderedTimeline(words, 4, opts);
    const b = wordsOnRenderedTimeline(words, 4, opts);
    expect(a).toEqual(b);
    expect(words[1].start).toBe(3000);
  });
});

// ── Source audio map, executed through ffmpeg ────────────────────────────────
// iPhone recordings carry a second, spatial-audio (APAC) track that FFmpeg has
// no decoder for. Mapping every audio stream (`0:a`) made the render ask to
// decode it, and every render and re-render of such an upload failed
// (Sentry CLIPIRO-WEB-A). The fixture stands in for that file: a MOV whose
// second audio track's sample entry is rewritten to an unknown fourcc.

function ffmpegBin(): string | null {
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  return fs.existsSync(local) ? local : null;
}
const FFMPEG = ffmpegBin();
const withFfmpeg = FFMPEG ? describe : describe.skip;

withFfmpeg("SOURCE_AUDIO_MAP — a source with an undecodable second audio track", () => {
  const run = (args: string[]) => {
    const res = spawnSync(FFMPEG!, ["-hide_banner", "-y", ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return { code: res.status ?? -1, stderr: res.stderr ?? "" };
  };

  function makeSource(dir: string): string {
    const src = path.join(dir, "src.mov");
    const made = run([
      "-f", "lavfi", "-i", "testsrc=s=320x180:r=30:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=1",
      "-map", "0:v", "-map", "1:a", "-map", "2:a",
      "-c:v", "libx264", "-c:a:0", "aac", "-c:a:1", "pcm_s16le", "-f", "mov", src,
    ]);
    expect(made.code, made.stderr).toBe(0);
    // PCM's sample entry is just its fourcc (no esds to recover the codec
    // from), so an unknown fourcc leaves the demuxer with codec "none".
    const buf = fs.readFileSync(src);
    const at = buf.indexOf("sowt");
    expect(at).toBeGreaterThan(-1);
    buf.write("zzzz", at);
    fs.writeFileSync(src, buf);
    return src;
  }

  const render = (src: string, audioMap: string) => run([
    "-i", src, "-filter_complex", "[0:v]null[video]",
    "-map", "[video]", "-map", audioMap, "-c:a", "aac", "-f", "null", "-",
  ]);

  it("renders with the first audio track, where mapping all audio fails", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autoclip-audio-"));
    try {
      const src = makeSource(dir);
      // The pre-fix map reproduces the prod failure…
      expect(render(src, "0:a?").code).not.toBe(0);
      // …and the map the render uses now gets past it, optional or not.
      const fixed = render(src, SOURCE_AUDIO_MAP);
      expect(fixed.code, fixed.stderr).toBe(0);
      expect(render(src, `${SOURCE_AUDIO_MAP}?`).code).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("computeClipCrop — layout templates", () => {
  const seg = { start: 10, end: 30, mood: "neutral" } as unknown as Parameters<typeof import("./autoclip-pipeline").computeClipCrop>[1];
  const cam = { x: 0.02, y: 0.02, w: 0.24, h: 0.3 };
  // A steady webcam face in the bottom-right for the whole clip.
  const camFaces = Array.from({ length: 41 }, (_, i) => ({ tSec: 10 + i * 0.5, x: 0.85, y: 0.75, w: 0.06, h: 0.1, confidence: 97 }));

  it("Full frame needs no faces", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    expect(computeClipCrop([], seg, "9:16", 1920, 1080, { speakerMode: "fit" }, null)).toEqual({ mode: "fit" });
  });

  it("gaming uses a hand-placed box with no face tracking", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop([], seg, "9:16", 1920, 1080, { speakerMode: "gaming", facecamBox: cam }, null);
    expect(crop?.mode).toBe("split");
    if (crop?.mode !== "split") return;
    expect(crop.topFrac).toBeCloseTo(1 / 3, 5);
    expect(crop.a[0].x).toBeLessThan(0.1);
  });

  it("the hand-placed box wins over a tracked face", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop(camFaces, seg, "9:16", 1920, 1080, { speakerMode: "gaming", facecamBox: cam }, null);
    if (crop?.mode !== "split") throw new Error("expected split");
    expect(crop.a[0].x).toBeLessThan(0.1);
  });

  it("gaming finds the webcam from face tracking when no box was placed", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop(camFaces, seg, "9:16", 1920, 1080, { speakerMode: "gaming" }, null);
    if (crop?.mode !== "split") throw new Error("expected split");
    expect(crop.a[0].x + crop.a[0].w).toBeGreaterThan(0.85);
  });

  it("gaming with no box and no faces shows the whole gameplay, not a centre crop", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    expect(computeClipCrop([], seg, "9:16", 1920, 1080, { speakerMode: "gaming" }, null)).toEqual({ mode: "fit" });
    expect(computeClipCrop([], seg, "9:16", 1920, 1080, { speakerMode: "gaming_pip" }, null)).toEqual({ mode: "fit" });
    expect(computeClipCrop([], seg, "16:9", 1920, 1080, { speakerMode: "gaming", facecamBox: cam }, null)).toEqual({ mode: "fit" });
  });

  it("gaming picture-in-picture from a box", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop([], seg, "9:16", 1920, 1080, { speakerMode: "gaming_pip", facecamBox: cam }, null);
    expect(crop?.mode).toBe("pip");
  });

  it("split without face tracking is the two-camera shot, left over right", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop([], seg, "9:16", 1920, 1080, { speakerMode: "split" }, null);
    if (crop?.mode !== "split") throw new Error("expected split");
    expect(crop.a[0].x + crop.a[0].w).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(crop.b[0].x).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it("a gaming layout takes Gemini's facecam box when none was placed", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop([], seg, "9:16", 1920, 1080, { speakerMode: "gaming" }, {
      features: { sceneVision: true },
      shots: [],
      scenes: [{ startSec: 0, endSec: 20, type: "gameplay_facecam", confidence: 90, facecamBox: { x: 0.7, y: 0.05, w: 0.25, h: 0.3 } }],
      tracks: null,
      planLayout: null,
    } as unknown as Parameters<typeof computeClipCrop>[6]);
    if (crop?.mode !== "split") throw new Error("expected split");
    expect(crop.a[0].x).toBeGreaterThan(0.6);
  });
});

// 2026-11-24: the podcast demo audit. Face samples shaped like the Gemini rung
// returns for a multi-camera podcast (one frame every 5s, no track ids), scored
// with lib/reframe-metrics — the share of sampled moments where the main face
// is inside the crop the renderer shows.
describe("computeClipCrop — podcast framing regressions", () => {
  const seg = (start: number, end: number) =>
    ({ start, end, mood: "neutral" } as unknown as Parameters<typeof import("./autoclip-pipeline").computeClipCrop>[1]);
  const face = (tSec: number, cx: number, w = 0.12) => ({ tSec, x: cx - w / 2, y: 0.25, w, h: 0.22, confidence: 90 });
  const opts = { speakerMode: "auto" as const, smartAutoReframe: true };

  it("opens on the speaker, not on a centre crop that pans over to them", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const { scoreFraming, cropAt } = await import("./reframe-metrics");
    // Guest off-centre at 0.65; the first sample is 3.5s into the clip.
    const faces = [3.5, 8.5, 13.5, 18.5].map((t) => face(100 + t, 0.65));
    const crop = computeClipCrop(faces, seg(100, 120), "9:16", 1280, 720, opts, null);
    if (crop?.mode !== "single") throw new Error("expected single");
    const atStart = cropAt(crop.keyframes, 0)!;
    expect(atStart.x + atStart.w).toBeGreaterThan(0.71); // the face's right edge
    const rel = faces.map((f) => ({ ...f, tSec: f.tSec - 100 }));
    expect(scoreFraming(crop, [{ ...rel[0], tSec: 0 }, ...rel], "9:16", 1280, 720).score).toBe(1);
  });

  it("never parks the crop between two people (host 0.64 alone, then a two-shot)", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const { scoreFraming } = await import("./reframe-metrics");
    const faces = [
      ...[0, 5, 10, 15].map((t) => face(462.5 + t, 0.64)),
      ...[20, 25, 30, 35, 40].flatMap((t) => [face(462.5 + t, 0.24, 0.1), face(462.5 + t, 0.74)]),
    ];
    const crop = computeClipCrop(faces, seg(462.4, 506.9), "9:16", 1280, 720, opts, null);
    const rel = faces.map((f) => ({ ...f, tSec: f.tSec - 462.4 }));
    const s = scoreFraming(crop, rel, "9:16", 1280, 720);
    expect(s.nobodyVisible).toBe(0);
  });

  it("shows the whole frame when the clip has no face, instead of guessing a centre crop", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    expect(computeClipCrop([], seg(0, 20), "9:16", 1280, 720, opts, null)).toEqual({ mode: "fit" });
    expect(computeClipCrop([], seg(0, 20), "9:16", 1280, 720, { speakerMode: "single" }, null)).toEqual({ mode: "fit" });
  });

  it("holds a faceless clip on its subject when one was found, in any aspect", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const subjectBox = { x: 0.1, y: 0, w: 0.3164, h: 1 }; // found for 9:16, centre 0.258
    for (const aspect of ["9:16", "4:5"] as const) {
      const crop = computeClipCrop([], seg(0, 20), aspect, 1280, 720, { ...opts, subjectBox }, null);
      if (crop?.mode !== "single") throw new Error(`expected a held crop at ${aspect}`);
      const k = crop.keyframes[0];
      expect(k.x + k.w / 2).toBeCloseTo(0.258, 2);
      expect(crop.keyframes.every((q) => q.x === k.x)).toBe(true);
    }
  });

  it("never stacks two camera angles as a split screen (tracked ids restart at cuts)", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const { scoreFraming } = await import("./reframe-metrics");
    const tracked = (id: string, cx: number, from: number, to: number) =>
      Array.from({ length: (to - from) * 4 }, (_, i) => ({ ...face(from + i / 4, cx), trackId: id }));
    const faces = [...tracked("w0-0", 0.38, 0, 10), ...tracked("w0-1", 0.64, 10, 20)];
    const crop = computeClipCrop(faces, seg(0, 20), "9:16", 1280, 720, { speakerMode: "split" }, null);
    expect(crop?.mode).not.toBe("split");
    expect(scoreFraming(crop, faces, "9:16", 1280, 720).score).toBeGreaterThan(0.9);
  });

  it("keeps per-shot framing when one odd shot wants a split", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const { scoreFraming } = await import("./reframe-metrics");
    // Shot 1 (0-30s): guest alone at 0.65. Shot 2 (30-40s): a two-shot.
    const faces = [
      ...[2, 7, 12, 17, 22, 27].map((t) => face(t, 0.65)),
      ...[32, 34, 36, 38].flatMap((t) => [face(t, 0.24, 0.1), face(t, 0.74)]),
    ];
    const ai = { features: { shotAwareReframe: true }, shots: [30], scenes: null, tracks: null, planLayout: null };
    const crop = computeClipCrop(faces, seg(0, 40), "9:16", 1280, 720, opts, ai as never);
    expect(crop?.mode).toBe("single");
    const s = scoreFraming(crop, faces, "9:16", 1280, 720);
    expect(s.nobodyVisible).toBe(0);
    expect(s.mainVisible).toBeGreaterThanOrEqual(8);
  });
});

// 2026-11: production had no face detector, so the face timeline is now the
// Gemini rung's — one frame every few seconds, no track ids. The facecam must
// still be found from samples that sparse, and auto mode must stack it.
describe("computeClipCrop — sparse (Gemini-sampled) faces", () => {
  const seg = { start: 10, end: 40, mood: "neutral" } as unknown as Parameters<typeof import("./autoclip-pipeline").computeClipCrop>[1];
  // A webcam face top-right, sampled every 3.3s across a 10-minute source.
  const sparseCam = Array.from({ length: 180 }, (_, i) => ({ tSec: 1.65 + i * 3.3, x: 0.86, y: 0.08, w: 0.05, h: 0.09, confidence: 90 }));

  it("gaming finds the webcam from sparse samples", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop(sparseCam, seg, "9:16", 1920, 1080, { speakerMode: "gaming" }, null);
    if (crop?.mode !== "split") throw new Error(`expected split, got ${crop?.mode}`);
    expect(crop.topFrac).toBeCloseTo(1 / 3, 5);
    expect(crop.a[0].x + crop.a[0].w).toBeGreaterThan(0.86);
  });

  it("auto stacks a small corner webcam over the gameplay instead of following it", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const crop = computeClipCrop(sparseCam, seg, "9:16", 1920, 1080, { speakerMode: "auto" }, null);
    if (crop?.mode !== "split") throw new Error(`expected split, got ${crop?.mode}`);
    expect(crop.topFrac).toBeCloseTo(1 / 3, 5);
  });

  it("auto stacks the real demo stream's webcam (face 0.23 tall at the top right)", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    // Median of the Gemini samples on the gaming demo source (Minecraft, 1280x720).
    const demo = sparseCam.map((f) => ({ ...f, x: 0.77, y: 0.07, w: 0.111, h: 0.232 }));
    const crop = computeClipCrop(demo, seg, "9:16", 1280, 720, { speakerMode: "auto" }, null);
    if (crop?.mode !== "split") throw new Error(`expected split, got ${crop?.mode}`);
    expect(crop.a[0].x + crop.a[0].w).toBeGreaterThan(0.85); // the top panel holds the webcam
  });

  it("auto still pans on a presenter, who is neither small nor in a corner", async () => {
    const { computeClipCrop } = await import("./autoclip-pipeline");
    const presenter = sparseCam.map((f) => ({ ...f, x: 0.42, y: 0.2, w: 0.16, h: 0.3 }));
    const crop = computeClipCrop(presenter, seg, "9:16", 1920, 1080, { speakerMode: "auto" }, null);
    expect(crop?.mode).toBe("single");
  });
});

describe("reportReframeFailure", () => {
  it("logs face-detection failure as an error, which goes to Sentry", async () => {
    const { logger } = await import("@/lib/logger");
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { reportReframeFailure } = await import("./autoclip-pipeline");
    reportReframeFailure("project-1", "unconfigured");
    expect(spy).toHaveBeenCalledWith("auto-clip", expect.stringContaining("unconfigured"), { projectId: "project-1", failure: "unconfigured" });
    spy.mockRestore();
  });
});

describe("resolveClipFaces — topping up a cached timeline", () => {
  const face = (tSec: number, trackId?: string) => ({ tSec, x: 0.6, y: 0.2, w: 0.1, h: 0.2, confidence: 90, ...(trackId ? { trackId } : {}) });
  const local = { path: "/tmp/src.mp4", durationSec: 600, windows: [{ start: 10, end: 30 }, { start: 100, end: 120 }], srcW: 1280, srcH: 720 };

  it("detects only the clip windows the cache never covered, and keeps the new track ids apart", async () => {
    const { resolveClipFaces } = await import("./autoclip-pipeline");
    localFaces.available = true;
    localFaces.detect.mockResolvedValueOnce({ boxes: [face(105, "w0-0")] });
    const r = await resolveClipFaces("u1", "https://x/v.mp4", [face(15)], local);
    expect(localFaces.detect).toHaveBeenCalledWith("/tmp/src.mp4", [{ start: 100, end: 120 }], 600, 1280, 720);
    expect(r.changed).toBe(true);
    expect(r.boxes.map((b) => b.tSec)).toEqual([15, 105]);
    expect(r.boxes[1].trackId).toMatch(/^r.+-w0-0$/);
  });

  it("leaves a cache that covers every clip alone", async () => {
    const { resolveClipFaces } = await import("./autoclip-pipeline");
    localFaces.available = true;
    localFaces.detect.mockClear();
    const r = await resolveClipFaces("u1", "https://x/v.mp4", [face(15), face(110)], local);
    expect(localFaces.detect).not.toHaveBeenCalled();
    expect(r).toEqual({ boxes: [face(15), face(110)], changed: false });
  });

  it("keeps the cache when the top-up fails", async () => {
    const { resolveClipFaces } = await import("./autoclip-pipeline");
    localFaces.available = true;
    localFaces.detect.mockResolvedValueOnce({ boxes: [], failure: "error" });
    const r = await resolveClipFaces("u1", "https://x/v.mp4", [face(15)], local);
    expect(r).toEqual({ boxes: [face(15)], changed: false });
    localFaces.available = false;
  });
});
