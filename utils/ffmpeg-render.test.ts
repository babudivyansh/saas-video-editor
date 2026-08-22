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
import { encodeArgs } from "./ffmpeg-render";

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
    const ffmpegBin = (() => {
      const candidate = path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
      return fs.existsSync(candidate) ? candidate : "ffmpeg";
    })();
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
