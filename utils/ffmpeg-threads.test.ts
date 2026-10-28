import { afterEach, describe, expect, it } from "vitest";
import { capFfmpegArgs, encodeArgs, ffmpegThreads } from "./ffmpeg-render";

// Production is a shared host that reports 48 cores; uncapped ffmpeg decode and
// filter threads pinned the plan at 100% CPU. See ffmpegThreads.
describe("capFfmpegArgs", () => {
  afterEach(() => { delete process.env.FFMPEG_THREADS; });

  it("caps filter threads globally and decoder threads per input", () => {
    const out = capFfmpegArgs(["-y", "-ss", "1", "-i", "a.mp4", "-i", "b.mp4", "-map", "0:v", ...encodeArgs("cpu"), "o.mp4"]);
    expect(out.slice(0, 4)).toEqual(["-filter_threads", "2", "-filter_complex_threads", "2"]);
    expect(out.join(" ")).toContain("-ss 1 -threads 2 -i a.mp4 -threads 2 -i b.mp4");
    // The output pin for libx264 survives untouched.
    expect(out.join(" ")).toContain("-threads 1 -c:v libx264");
  });

  it("leaves an input that already sets -threads alone", () => {
    const out = capFfmpegArgs(["-threads", "4", "-i", "a.mp4", "o.mp4"]);
    expect(out.filter((a) => a === "-threads")).toHaveLength(1);
  });

  it("does not touch a bare probe", () => {
    expect(capFfmpegArgs(["-i", "a.mp4"])).toEqual(["-i", "a.mp4"]);
  });

  it("reads FFMPEG_THREADS, falling back to 2 on junk", () => {
    process.env.FFMPEG_THREADS = "1";
    expect(ffmpegThreads()).toBe(1);
    process.env.FFMPEG_THREADS = "nope";
    expect(ffmpegThreads()).toBe(2);
  });
});
