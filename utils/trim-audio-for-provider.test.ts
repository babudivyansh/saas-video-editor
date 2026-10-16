// The audio tools bill by the PROBED duration, which comes from the container
// header — a value the uploader controls. trimAudioForProvider is what makes a
// lying header worthless: whatever the file claims, the provider only ever
// receives audio up to the billed length, with no video stream attached.
// Runs the real bundled ffmpeg end to end.

import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { ffmpegBin, probeMediaDuration, trimAudioForProvider } from "./ffmpeg-render";

const d = ffmpegBin && fs.existsSync(ffmpegBin) ? describe : describe.skip;

d("trimAudioForProvider", () => {
  it("caps the audio at the billed length and drops the video stream", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trim-test-"));
    const input = path.join(dir, `${randomUUID()}.mp4`);
    const output = path.join(dir, "provider.mp3");
    try {
      // 10 s of video + tone: what the provider would have received in full.
      const gen = spawnSync(ffmpegBin!, [
        "-hide_banner", "-y",
        "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=10",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
        "-c:v", "libx264", "-c:a", "aac", "-shortest", input,
      ], { encoding: "utf8" });
      expect(gen.status, gen.stderr?.slice(-1500)).toBe(0);

      await trimAudioForProvider(input, output, 2.4);

      const probe = await probeMediaDuration(output);
      // Billed 2.4 s → rounded up to 3 s; never anywhere near the 10 s source.
      expect(probe.durationSec).not.toBeNull();
      expect(probe.durationSec!).toBeGreaterThan(2.5);
      expect(probe.durationSec!).toBeLessThan(3.5);

      const streams = spawnSync(ffmpegBin!, ["-hide_banner", "-i", output], { encoding: "utf8" }).stderr ?? "";
      expect(streams).toMatch(/Audio: mp3/);
      expect(streams).not.toMatch(/Video:/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
