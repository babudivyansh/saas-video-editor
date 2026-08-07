import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Regression for a production incident: AutoClip stuck on "analyzing" for ~28
// minutes with no progress and no failure.
//
// decodePcm (added with the signal track) spawned ffmpeg with NO watchdog and
// only resolved on 'close'/'error'. A decode that never signalled EOF left the
// promise unresolved forever — and because buildSignalTrack is awaited inside
// pickJob's Promise.all before the clips are created, that hung the entire
// pick job and stranded the project on "analyzing". Every other ffmpeg spawn
// in the codebase carries a timeout; this one didn't.
//
// These run the REAL ffmpeg binary against unreadable input and assert the
// path always resolves (never hangs) and degrades to empty rather than
// throwing — the signal track is best-effort.

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b" },
}));

import { buildSignalTrack, computeAudioPeaks, EMPTY_SIGNAL_TRACK } from "./signal-track";

function ffmpegBin(): string | null {
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  return fs.existsSync(local) ? local : null;
}
const d = ffmpegBin() ? describe : describe.skip;

function tmp(name: string, contents: Buffer | string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sigtrack-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

d("signal track never hangs on unreadable media", () => {
  it("buildSignalTrack resolves (not hangs) on a garbage file", async () => {
    const p = tmp("garbage.mp4", "definitely not a video");
    try {
      const track = await buildSignalTrack(p, 0, 5, [{ word: "hi", start: 0, end: 400 }], []);
      // Degrades to the empty track rather than throwing or hanging.
      expect(track.v).toBe(1);
      expect(track.rms).toEqual([]);
      expect(track.energy).toEqual([]);
    } finally {
      fs.rmSync(path.dirname(p), { recursive: true, force: true });
    }
  }, 30_000);

  it("computeAudioPeaks resolves with [] on a garbage file", async () => {
    const p = tmp("garbage2.mp4", "still not a video");
    try {
      expect(await computeAudioPeaks(p)).toEqual([]);
    } finally {
      fs.rmSync(path.dirname(p), { recursive: true, force: true });
    }
  }, 30_000);

  it("produces real envelopes for a readable clip with speech-length audio", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sigtrack-ok-"));
    const clip = path.join(dir, "clip.mp4");
    try {
      const { spawnSync } = await import("child_process");
      const res = spawnSync(ffmpegBin()!, [
        "-hide_banner", "-y",
        "-f", "lavfi", "-i", "testsrc=s=160x120:r=15:d=3",
        "-f", "lavfi", "-i", "sine=frequency=200:duration=3",
        "-shortest", clip,
      ], { encoding: "utf8" });
      expect(res.status, res.stderr?.slice(-600)).toBe(0);

      const words = Array.from({ length: 6 }, (_, i) => ({ word: `w${i}`, start: i * 400, end: i * 400 + 350 }));
      const track = await buildSignalTrack(clip, 0, 3, words, []);
      expect(track.rms.length).toBeGreaterThan(0);
      expect(track.energy.length).toBe(track.rms.length);

      const peaks = await computeAudioPeaks(clip);
      expect(peaks.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("EMPTY_SIGNAL_TRACK", () => {
  it("is a valid empty track shape", () => {
    expect(EMPTY_SIGNAL_TRACK.v).toBe(1);
    expect(EMPTY_SIGNAL_TRACK.energy).toEqual([]);
    expect(EMPTY_SIGNAL_TRACK.pauses).toEqual([]);
  });
});
