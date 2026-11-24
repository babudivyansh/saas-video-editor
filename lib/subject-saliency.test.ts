import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { bestWindow, columnInterest, subjectBoxForWindow } from "./subject-saliency";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";

describe("bestWindow", () => {
  it("finds a concentrated subject", () => {
    const interest = new Float64Array(64).fill(0.2 / 54);
    for (let i = 5; i < 15; i++) interest[i] = 0.8 / 10;
    const box = bestWindow(interest, 0.3)!;
    expect(box).not.toBeNull();
    expect(box.x).toBeLessThanOrEqual(5 / 64);
    expect(box.x + box.w).toBeGreaterThanOrEqual(15 / 64);
  });

  it("returns null when interest is spread evenly (nothing should be cut)", () => {
    expect(bestWindow(new Float64Array(64).fill(1 / 64), 0.3)).toBeNull();
  });
});

describe("columnInterest", () => {
  it("weights where things move", () => {
    const a = new Uint8Array(64 * 36).fill(50), b = new Uint8Array(64 * 36).fill(50);
    for (let y = 10; y < 20; y++) for (let x = 40; x < 48; x++) b[y * 64 + x] = 200;
    const col = columnInterest([a, b]);
    expect(col[44]).toBeGreaterThan(col[10] * 10);
  });
});

describe("subjectBoxForWindow (ffmpeg, end to end)", () => {
  const make = async (dir: string, name: string, src: string) => {
    const out = path.join(dir, name);
    await runFFmpegArgs(["-y", "-f", "lavfi", "-i", src, "-t", "4", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", out], 60_000);
    return out;
  };

  it("holds on a subject moving on the left of a quiet frame", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saliency-test-"));
    try {
      const v = await make(dir, "left.mp4",
        "color=c=gray:s=640x360:r=10,drawbox=x='80+40*sin(t*3)':y=110:w=70:h=140:color=white:t=fill");
      const box = await subjectBoxForWindow(v, 0, 4, "9:16", 640, 360);
      expect(box).not.toBeNull();
      expect(box!.x + box!.w / 2).toBeLessThan(0.35);
      expect(box!.w).toBeCloseTo(360 * 9 / 16 / 640, 3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the whole frame for a picture busy everywhere (screen-recording-like)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saliency-test-"));
    try {
      const v = await make(dir, "busy.mp4", "testsrc2=s=640x360:r=10");
      expect(await subjectBoxForWindow(v, 0, 4, "9:16", 640, 360)).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
