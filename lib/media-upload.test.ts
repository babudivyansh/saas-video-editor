import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { ffmpegBin } from "@/utils/ffmpeg-render";
import { saveMediaUpload } from "./media-upload";

// The tool routes ran ffmpeg on whatever was uploaded, with a temp extension
// taken from the user's filename — and ffmpeg opens an uploaded HLS playlist
// (.m3u8) and loads the files it names. saveMediaUpload is the gate: safe
// extension + a container allow-list. Runs the real bundled ffmpeg.

const d = ffmpegBin && fs.existsSync(ffmpegBin) ? describe : describe.skip;
const created: string[] = [];
afterEach(() => { for (const f of created.splice(0)) fs.rmSync(f, { force: true }); });

function tmp(name: string, data: Buffer | string): string {
  const p = path.join(os.tmpdir(), `media-upload-test-${randomUUID()}-${name}`);
  fs.writeFileSync(p, data);
  created.push(p);
  return p;
}

const asFile = (p: string, name: string, type: string) => new File([fs.readFileSync(p)], name, { type });

d("saveMediaUpload", () => {
  it("accepts a real video and reports its length", async () => {
    const src = path.join(os.tmpdir(), `media-upload-test-${randomUUID()}.mp4`);
    created.push(src);
    const gen = spawnSync(ffmpegBin!, ["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-shortest", src], { encoding: "utf8" });
    expect(gen.status, gen.stderr?.slice(-800)).toBe(0);

    const res = await saveMediaUpload(asFile(src, "clip.mp4", "video/mp4"), randomUUID(), "mp4");
    expect(res).not.toBeInstanceOf(Response);
    const { inputPath, durationSec } = res as { inputPath: string; durationSec: number };
    created.push(inputPath);
    expect(durationSec).toBeGreaterThan(1.5);
    expect(inputPath.endsWith(".mp4")).toBe(true);
  }, 60_000);

  it("rejects an HLS playlist named .m3u8 — and deletes it", async () => {
    const local = tmp("seg.ts", "x");
    const playlist = tmp("probe.m3u8", `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1.0,\n${local}\n#EXT-X-ENDLIST\n`);
    const jobId = randomUUID();
    const res = await saveMediaUpload(asFile(playlist, "evil.m3u8", "audio/mpeg"), jobId, "mp3");
    expect((res as Response).status).toBe(400);
    // Never written under the user's .m3u8 extension, and nothing left behind.
    expect(fs.readdirSync(os.tmpdir()).some((f) => f.startsWith(jobId))).toBe(false);
  }, 60_000);

  it("rejects bytes that aren't media", async () => {
    const junk = tmp("junk.mp4", Buffer.alloc(4096, 7));
    const res = await saveMediaUpload(asFile(junk, "junk.mp4", "video/mp4"), randomUUID(), "mp4");
    expect((res as Response).status).toBe(400);
  }, 60_000);
});
