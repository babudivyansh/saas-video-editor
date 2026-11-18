import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { pruneFfmpegStaticCache, ffmpegStaticCacheDir } from "./prune-ffmpeg-static-cache.mjs";

// Hostinger 2026-11-19: ffmpeg-static's download cache reached 14.6 GB, one
// never-reused copy per `npm install` (the key is GitHub's signed URL).
describe("prune-ffmpeg-static-cache", () => {
  it("points at ffmpeg-static's own cache folder", () => {
    expect(String(ffmpegStaticCacheDir())).toMatch(/ffmpeg-static-nodejs/);
  });

  it("deletes the cached download files and reports what it freed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffmpeg-cache-test-"));
    try {
      fs.writeFileSync(path.join(dir, "abc.body"), Buffer.alloc(1000));
      fs.writeFileSync(path.join(dir, "abc.json"), "{}");
      fs.mkdirSync(path.join(dir, "keep-dir"));
      const r = pruneFfmpegStaticCache(dir);
      expect(r).toEqual({ removed: 2, freed: 1002 });
      expect(fs.readdirSync(dir)).toEqual(["keep-dir"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is a no-op when the cache does not exist", () => {
    expect(pruneFfmpegStaticCache(path.join(os.tmpdir(), "no-such-ffmpeg-cache-xyz"))).toEqual({ removed: 0, freed: 0 });
  });
});
