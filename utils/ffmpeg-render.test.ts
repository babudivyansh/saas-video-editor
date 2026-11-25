// Regression test for the P0-2 SEV-1 fix: production's CPU advertises AVX-512
// but x264's default multi-threaded slicing fails to open the encoder using
// it (confirmed via /api/admin/render-diagnostics against the real prod
// host — exit 187, "Error while opening encoder" right after AVX-512 is
// logged as detected, at both a synthetic resolution and this app's actual
// 1080x1920 export size). Forcing -threads 1 fixed it in both cases.
//
// This suite can't reproduce the host-specific AVX-512 bug locally (it's a
// property of that specific CPU/hypervisor, not of ffmpeg args in general),
// so it guards the two things that matter here instead: (1) encodeArgs("cpu")
// keeps emitting -threads 1 ahead of -c:v so a future refactor can't silently
// drop it, and (2) the resulting args still produce a real, valid encode
// end-to-end against the actual bundled ffmpeg binary — proving the fix
// doesn't break normal encoding.

import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { encodeArgs, ffmpegBin, FfmpegStalledError, getMediaFps, parseDisplayDimensions, runFFmpegWithProgress } from "./ffmpeg-render";

// Real runs against the bundled binary: the watchdog and the progress maths
// both hang off what ffmpeg actually prints, which a mock would only restate.
describe("runFFmpegWithProgress", () => {
  const tmpOut = (tag: string) => path.join(os.tmpdir(), `ffmpeg-progress-${tag}-${Date.now()}.mp4`);

  it("kills a run that stops encoding, and says what ffmpeg last printed", async () => {
    // `-re` on a 1 fps source: one frame, then nothing new for a second at a
    // time. ffmpeg keeps printing its status line throughout, so this also
    // proves a repeated status line is not mistaken for progress.
    const out = tmpOut("stall");
    const started = Date.now();
    const run = runFFmpegWithProgress(
      ["-y", "-re", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=0.2", "-t", "60", ...encodeArgs("cpu"), "-an", out],
      () => {},
      { stallMs: 2500 },
    );
    try {
      await expect(run).rejects.toBeInstanceOf(FfmpegStalledError);
      // The setup lines survive however many status lines follow them.
      await expect(run).rejects.toThrow(/encoded nothing new for 2500ms[\s\S]*Input #0, lavfi[\s\S]*Stream #0:0/);
      expect(Date.now() - started).toBeLessThan(15_000);
    } finally {
      try { fs.unlinkSync(out); } catch { /* best effort */ }
    }
  }, 30_000);

  it("measures progress against the output length, not the input's", async () => {
    // A 1 second cut from a 20 second file. Against the input's Duration the
    // run never reported more than 5%.
    const src = tmpOut("src");
    const out = tmpOut("cut");
    await runFFmpegWithProgress(
      ["-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30", "-t", "20", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", src],
      () => {},
    );
    const seen: number[] = [];
    const legacy: number[] = [];
    try {
      const cut = ["-y", "-ss", "5", "-to", "6", "-i", src, ...encodeArgs("cpu"), "-an", out];
      await runFFmpegWithProgress(cut, (p) => seen.push(p), { totalSec: 1, stallMs: 20_000 });
      await runFFmpegWithProgress(cut, (p) => legacy.push(p));
      expect(Math.max(0, ...seen)).toBeGreaterThan(50);
      expect(Math.max(0, ...legacy)).toBeLessThanOrEqual(5);
      expect(await getMediaFps(src)).toBe(30);
    } finally {
      for (const f of [src, out]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
    }
  }, 60_000);
});

describe("encodeArgs(\"cpu\") — P0-2 threads=1 fix", () => {
  it("forces single-threaded libx264, ordered ahead of -c:v", () => {
    const args = encodeArgs("cpu");
    const threadsIdx = args.indexOf("-threads");
    const cvIdx = args.indexOf("-c:v");
    expect(threadsIdx).toBeGreaterThanOrEqual(0);
    expect(args[threadsIdx + 1]).toBe("1");
    expect(cvIdx).toBeGreaterThan(threadsIdx);
  });

  it("leaves the gpu (nvenc) target unaffected — the bug is libx264-specific", () => {
    const args = encodeArgs("gpu");
    expect(args).not.toContain("-threads");
    expect(args).toContain("h264_nvenc");
  });

  it("still produces a real, valid encode end-to-end at the app's actual 1080x1920 export size", async () => {
    // Uses the application's own resolved binary (pinned vendor runtime on
    // Linux, ffmpeg-static in local dev) rather than a hard-coded
    // node_modules path — the Linux ffmpeg-static build is the broken one.
    const out = path.join(os.tmpdir(), `ffmpeg-render-cpu-fix-test-${Date.now()}.mp4`);
    const args = [
      "-y",
      "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=440",
      "-t", "1",
      ...encodeArgs("cpu"),
      out,
    ];
    const result = await new Promise<{ code: number | null }>((resolve) => {
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      proc.on("close", (code) => resolve({ code }));
      proc.on("error", () => resolve({ code: -1 }));
    });
    try {
      expect(result.code).toBe(0);
      expect(fs.existsSync(out)).toBe(true);
      expect(fs.statSync(out).size).toBeGreaterThan(0);
    } finally {
      try { fs.unlinkSync(out); } catch { /* best effort */ }
    }
  }, 20_000);
});

// A phone video shot upright is coded landscape with a rotation side-data line;
// every decode autorotates it, so crops must use the rotated size.
describe("parseDisplayDimensions", () => {
  const banner = (rotation?: string) => [
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':",
    "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], 30 fps",
    ...(rotation ? ["    Side data:", `      Display Matrix: rotation of ${rotation} degrees`] : []),
    "  Stream #0:1[0x2](und): Audio: aac (LC), 44100 Hz, stereo",
  ].join("\n");

  it("reports the coded size when there is no rotation", () => {
    expect(parseDisplayDimensions(banner())).toEqual({ w: 1920, h: 1080 });
  });

  it("swaps width and height for a quarter turn either way", () => {
    expect(parseDisplayDimensions(banner("-90.00"))).toEqual({ w: 1080, h: 1920 });
    expect(parseDisplayDimensions(banner("90.00"))).toEqual({ w: 1080, h: 1920 });
    expect(parseDisplayDimensions(banner("270.00"))).toEqual({ w: 1080, h: 1920 });
  });

  it("keeps the size for a half turn", () => {
    expect(parseDisplayDimensions(banner("180.00"))).toEqual({ w: 1920, h: 1080 });
  });

  it("returns zeros when there is no video stream", () => {
    expect(parseDisplayDimensions("Stream #0:0: Audio: aac")).toEqual({ w: 0, h: 0 });
  });

  it("matches what ffmpeg actually decodes for a rotated file", async () => {
    const { getMediaDimensions, runFFmpegArgs } = await import("./ffmpeg-render");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rot-"));
    try {
      const plain = path.join(dir, "plain.mp4"), rot = path.join(dir, "rot.mp4");
      await runFFmpegArgs(["-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "0.5", "-pix_fmt", "yuv420p", plain], 60_000);
      await runFFmpegArgs(["-y", "-display_rotation", "90", "-i", plain, "-c", "copy", rot], 60_000);
      expect(await getMediaDimensions(rot)).toEqual({ w: 180, h: 320 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
