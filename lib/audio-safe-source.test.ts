import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { audioSafeSource, audioSafePathFor, discardAudioSafeSource, isCorruptAudioFailure } = await import("./audio-safe-source");
const { runFFmpegArgs, ffmpegBin } = await import("@/utils/ffmpeg-render");

// CLIPIRO-WEB-14 (2026-11-19): an upload whose AAC track was partly corrupt
// failed every clip render with "Rematrix is needed between 9 channels and
// stereo". The fixture is 40 ADTS frames of a stereo track with bytes
// corrupted until ffmpeg decodes one frame as 21 channels with no layout:
// the same failure, small enough to commit.
const FIXTURE = path.join(process.cwd(), "lib", "__fixtures__", "corrupt-aac-channel-switch.aac");
const haveFfmpeg = Boolean(ffmpegBin) && spawnSync(ffmpegBin!, ["-version"]).status === 0;
const withFfmpeg = haveFfmpeg ? describe : describe.skip;

describe("isCorruptAudioFailure", () => {
  it("matches the production stderr", () => {
    expect(isCorruptAudioFailure(new Error("[auto_aresample_0] [SWR] Rematrix is needed between 9 channels and stereo but there is not enough information to do it"))).toBe(true);
    expect(isCorruptAudioFailure(new Error("[auto_aresample_0] Failed to configure output pad on auto_aresample_0"))).toBe(true);
  });
  it("ignores other ffmpeg failures", () => {
    expect(isCorruptAudioFailure(new Error("[Parsed_crop_0] Invalid too big or non positive size"))).toBe(false);
    expect(isCorruptAudioFailure("Download timed out")).toBe(false);
  });
});

withFfmpeg("audioSafeSource on real ffmpeg", () => {
  const work: string[] = [];
  afterEach(() => {
    for (const p of work.splice(0)) fs.rmSync(p, { recursive: true, force: true });
  });

  it("the corrupt track fails a plain stereo encode, and renders after the repair", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-safe-test-"));
    work.push(dir);
    const src = path.join(dir, "src.aac");
    fs.copyFileSync(FIXTURE, src);
    const encode = (input: string) => runFFmpegArgs(["-y", "-i", input, "-c:a", "aac", "-ac", "2", path.join(dir, "out.m4a")]);

    const failure = await encode(src).then(() => null, (e: unknown) => e);
    expect(failure).not.toBeNull();
    expect(isCorruptAudioFailure(failure)).toBe(true);

    const fixed = await audioSafeSource(src);
    expect(fixed).toBe(audioSafePathFor(src));
    await expect(encode(fixed)).resolves.toBeUndefined();

    // Shared by concurrent clips, then removed with the source.
    expect(await audioSafeSource(src)).toBe(fixed);
    discardAudioSafeSource(src);
    expect(fs.existsSync(fixed)).toBe(false);
  }, 60_000);
});
