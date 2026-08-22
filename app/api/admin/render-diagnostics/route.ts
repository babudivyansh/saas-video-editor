// SEV-1 diagnostic route for the production export outage (P0-2). Admin-only
// (withAdmin requires role + a recent OTP step-up — this reveals server
// filesystem paths and binary versions, not something a bare dashboard
// session should be able to probe). Answers, with real evidence instead of
// guesses, exactly what CLIPIRO_EDITOR_COMPLETE_AUDIT.md's Phase 3/4/5 ask
// for: is the production ffmpeg binary the right OS/arch, does it have the
// encoders this app actually requests, and does the simplest possible encode
// using this app's own encodeArgs() succeed at all — all run from inside the
// real production Node process, which is the one place that actually matters
// since there is no shell/SSH access to the host available for this
// investigation.
//
// Every value returned here is either a version string, a boolean, a byte
// count, or ffmpeg's own stderr for a synthetic (lavfi) smoke-test input —
// never a real user's file path, signed URL, token, or asset content.

import os from "os";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { ffmpegBin, ffmpegBinaryInfo, encodeArgs } from "@/utils/ffmpeg-render";

export function run(bin: string, args: string[], timeoutMs = 15_000): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; spawnError: string | null }> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: null, signal: null, stdout: "", stderr: "", spawnError: e instanceof Error ? e.message : String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => { proc.kill("SIGKILL"); }, timeoutMs);
    const finish = (result: { code: number | null; signal: NodeJS.Signals | null; spawnError: string | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Full, untruncated output — a caller searching a long listing (e.g.
      // `-encoders`) for a substring needs the whole thing, not just the
      // tail. Truncate only at the point of building the HTTP response, not
      // here (a prior version of this truncated to the last 4000 chars here,
      // which silently cut libx264/aac out of the `-encoders` listing and
      // would have reported a false "encoder missing" — caught locally
      // before this ever reached production).
      resolve({ ...result, stdout, stderr });
    };
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code, signal) => finish({ code, signal, spawnError: null }));
    proc.on("error", (err) => finish({ code: null, signal: null, spawnError: err.message }));
  });
}

async function checkWritable(dir: string): Promise<{ writable: boolean; error?: string }> {
  const probe = path.join(dir, `diag-write-probe-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(probe, "probe");
    fs.unlinkSync(probe);
    return { writable: true };
  } catch (e) {
    return { writable: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function diskFree(dir: string): { availableBytes: number | null; totalBytes: number | null; error?: string } {
  try {
    // Node 18.15+/19.6+. Falls back gracefully below if unavailable.
    const stats = (fs as unknown as { statfsSync?: (p: string) => { bavail: number; bsize: number; blocks: number } }).statfsSync?.(dir);
    if (!stats) return { availableBytes: null, totalBytes: null, error: "fs.statfsSync unavailable on this Node version" };
    return { availableBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize };
  } catch (e) {
    return { availableBytes: null, totalBytes: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export const GET = withAdmin(async () => {
  const tmp = os.tmpdir();

  // 1. Binary identity
  const binInfo = ffmpegBinaryInfo();
  let executable = false;
  let statInfo: { size: number; mode: string } | null = null;
  try {
    fs.accessSync(binInfo.path, fs.constants.X_OK);
    executable = true;
  } catch { /* reported as false below */ }
  try {
    const st = fs.statSync(binInfo.path);
    statInfo = { size: st.size, mode: (st.mode & 0o777).toString(8) };
  } catch { /* file may not exist at all — binInfo.bundled already reflects that */ }

  // 2. Version + encoder availability
  const version = await run(ffmpegBin, ["-version"]);
  const encoders = await run(ffmpegBin, ["-hide_banner", "-encoders"]);
  const requestedEncoders = ["libx264", "aac", "h264_nvenc"]; // cpu path uses the first two; gpu path (unused in prod per lib/render-target.ts) uses the third
  const encoderAvailability = Object.fromEntries(
    requestedEncoders.map((name) => [name, new RegExp(`\\b${name}\\b`).test(encoders.stdout)]),
  );

  // 3. Filesystem
  const tmpWritable = await checkWritable(tmp);
  const disk = diskFree(tmp);

  // 4. Minimal smoke test — the exact same encodeArgs("cpu") this app's real
  // renders use, against a synthetic lavfi input so no real asset/S3 access
  // is needed. This directly tests "does the requested encoder actually work
  // end-to-end", not just "does ffmpeg -encoders list it".
  const smokeOut = path.join(tmp, `render-diagnostics-smoke-${Date.now()}.mp4`);
  const smokeArgs = [
    "-y",
    "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440",
    "-t", "2",
    ...encodeArgs("cpu"),
    smokeOut,
  ];
  const smoke = await run(ffmpegBin, smokeArgs, 30_000);
  let smokeOutputInfo: { exists: boolean; size: number } = { exists: false, size: 0 };
  try {
    const st = fs.statSync(smokeOut);
    smokeOutputInfo = { exists: true, size: st.size };
  } catch { /* stays false — that's meaningful too */ }
  try { fs.unlinkSync(smokeOut); } catch { /* best effort cleanup */ }

  // 5. Variant probes — only run once the baseline smoke test above has
  // actually failed. The baseline uses this app's real encodeArgs("cpu");
  // if it already fails, these narrow down *why*, testing specific
  // mitigations for known libx264-in-a-VM failure classes (see comments per
  // variant) rather than guessing at a fix blind. Each is independent and
  // self-contained so a bad candidate can't affect the others' results.
  const variantResults: Array<{ name: string; args: string[]; exitCode: number | null; success: boolean; stderrTail: string }> = [];
  if (smoke.spawnError === null && !(smoke.code === 0 && smokeOutputInfo.exists && smokeOutputInfo.size > 0)) {
    const variants: Array<{ name: string; size: string; args: string[] }> = [
      {
        // ffmpeg's own per-output -threads option is honored by the libx264
        // wrapper as the encoder's thread count (libavcodec/libx264.c reads
        // avctx->thread_count into x264's param.i_threads) — this is a
        // documented ffmpeg option, not an x264-internal one. Tests whether
        // x264's default multi-threaded slicing is where this breaks.
        name: "global_threads_1",
        size: "1280x720",
        args: ["-threads", "1", "-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"],
      },
      {
        // Different preset exercises a different set of x264 asm code paths;
        // narrows down whether the failure is preset-specific.
        name: "ultrafast_preset",
        size: "1280x720",
        args: ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"],
      },
      {
        // Smaller frame size narrows down whether this is a buffer-size /
        // memory-allocation failure rather than an instruction-set one.
        name: "low_res_320x240",
        size: "320x240",
        args: ["-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"],
      },
      {
        // 1080x1920 (9:16) is this app's actual, most common export
        // resolution (lib/editor/types.ts ASPECT_DIMENSIONS) — confirms the
        // failure reproduces at real production dimensions, not just the
        // smaller synthetic default above.
        name: "real_res_1080x1920_default_threads",
        size: "1080x1920",
        args: ["-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"],
      },
      {
        // The candidate fix (-threads 1), tested at the real 1080x1920
        // export resolution rather than the smaller 1280x720 used above —
        // must pass here before it's trusted as the actual fix.
        name: "real_res_1080x1920_threads_1",
        size: "1080x1920",
        args: ["-threads", "1", "-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"],
      },
    ];
    for (const v of variants) {
      const out = path.join(tmp, `render-diagnostics-variant-${v.name}-${Date.now()}.mp4`);
      const size = v.size;
      const args = [
        "-y",
        "-f", "lavfi", "-i", `testsrc=size=${size}:rate=30`,
        "-f", "lavfi", "-i", "sine=frequency=440",
        "-t", "2",
        ...v.args,
        out,
      ];
      const r = await run(ffmpegBin, args, 30_000);
      let info: { exists: boolean; size: number } = { exists: false, size: 0 };
      try {
        const st = fs.statSync(out);
        info = { exists: true, size: st.size };
      } catch { /* stays false */ }
      try { fs.unlinkSync(out); } catch { /* best effort cleanup */ }
      variantResults.push({
        name: v.name,
        args,
        exitCode: r.code,
        success: r.spawnError === null && r.code === 0 && info.exists && info.size > 0,
        stderrTail: r.stderr.slice(-800),
      });
    }
  }

  return NextResponse.json({
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cwd: process.cwd(),
      tmpdir: tmp,
    },
    binary: {
      resolvedPath: binInfo.path,
      bundled: binInfo.bundled,
      existsOnDisk: statInfo !== null,
      executable,
      sizeBytes: statInfo?.size ?? null,
      permissionsOctal: statInfo?.mode ?? null,
    },
    version: {
      spawnError: version.spawnError,
      exitCode: version.code,
      firstLine: version.stdout.split("\n")[0] ?? null,
      stderrTail: version.spawnError ? version.stderr.slice(-2000) : undefined,
    },
    encoders: {
      spawnError: encoders.spawnError,
      exitCode: encoders.code,
      availability: encoderAvailability,
    },
    filesystem: {
      tmpWritable: tmpWritable.writable,
      tmpWriteError: tmpWritable.error ?? null,
      diskAvailableBytes: disk.availableBytes,
      diskTotalBytes: disk.totalBytes,
      diskCheckError: disk.error ?? null,
    },
    smokeTest: {
      argsUsed: smokeArgs,
      spawnError: smoke.spawnError,
      exitCode: smoke.code,
      signal: smoke.signal,
      outputProduced: smokeOutputInfo,
      stderrTail: smoke.stderr.slice(-2000),
      verdict: smoke.spawnError
        ? "SPAWN FAILED — binary not found/executable"
        : smoke.code === 0 && smokeOutputInfo.exists && smokeOutputInfo.size > 0
          ? "SUCCESS — minimal encode works"
          : "FAILED — ffmpeg ran but did not produce a valid output (see exitCode/signal/stderrTail)",
    },
    variantProbes: variantResults,
  });
});
