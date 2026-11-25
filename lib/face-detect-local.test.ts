import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  decodeYunet, detectFacesLocal, lumaThumb, mergeWindows, splitTiles, thumbDiff, tileLayout, trackWindow, yawFromLandmarks,
  type Detection,
} from "./face-detect-local";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";

/** Empty YuNet heads for a 640x640 input, with one cell set. */
function heads(set?: { stride: number; idx: number; score: number; bbox: number[]; kps?: number[] }) {
  const out: Record<string, { data: Float32Array }> = {};
  for (const s of [8, 16, 32]) {
    const n = (640 / s) ** 2;
    out[`cls_${s}`] = { data: new Float32Array(n) };
    out[`obj_${s}`] = { data: new Float32Array(n) };
    out[`bbox_${s}`] = { data: new Float32Array(n * 4) };
    out[`kps_${s}`] = { data: new Float32Array(n * 10) };
  }
  if (set) {
    const { stride: s, idx, score, bbox, kps } = set;
    out[`cls_${s}`].data[idx] = score;
    out[`obj_${s}`].data[idx] = score;
    out[`bbox_${s}`].data.set(bbox, idx * 4);
    if (kps) out[`kps_${s}`].data.set(kps, idx * 10);
  }
  return out;
}

describe("decodeYunet", () => {
  it("decodes a cell's offset and log-size into input pixels", () => {
    // stride 32 grid is 20x20; cell (row 3, col 5) = index 65.
    const d = decodeYunet(heads({ stride: 32, idx: 65, score: 0.9, bbox: [0.5, 0.5, Math.log(2), Math.log(3)] }));
    expect(d).toHaveLength(1);
    expect(d[0].x + d[0].w / 2).toBeCloseTo((5 + 0.5) * 32, 3);
    expect(d[0].y + d[0].h / 2).toBeCloseTo((3 + 0.5) * 32, 3);
    expect(d[0].w).toBeCloseTo(64, 3);
    expect(d[0].h).toBeCloseTo(96, 3);
    expect(d[0].score).toBeCloseTo(0.9, 5); // sqrt(0.9 * 0.9)
  });

  it("drops cells below the score threshold", () => {
    expect(decodeYunet(heads({ stride: 8, idx: 10, score: 0.5, bbox: [0, 0, 1, 1] }))).toHaveLength(0);
  });
});

describe("tileLayout / splitTiles", () => {
  it("stacks two landscape frames and maps each tile back to its own frame", () => {
    const layout = tileLayout(1280, 720);
    expect(layout).toMatchObject({ cols: 1, rows: 2 });
    expect(layout.fw).toBeLessThanOrEqual(640);
    expect(layout.fh).toBeLessThanOrEqual(320);
    // A face centred in the bottom tile at the frame's middle.
    const cx = layout.fw / 2, cy = 320 + layout.fh / 2;
    const det: Detection = { x: cx - 20, y: cy - 25, w: 40, h: 50, score: 0.9, kps: Array(10).fill(0) };
    const tiles = splitTiles([det], layout);
    expect(tiles[0]).toHaveLength(0);
    expect(tiles[1]).toHaveLength(1);
    expect(tiles[1][0].x + tiles[1][0].w / 2).toBeCloseTo(0.5, 2);
    expect(tiles[1][0].y + tiles[1][0].h / 2).toBeCloseTo(0.5, 2);
  });

  it("puts portrait frames side by side", () => {
    expect(tileLayout(720, 1280)).toMatchObject({ cols: 2, rows: 1 });
    expect(tileLayout(1080, 1080)).toMatchObject({ cols: 1, rows: 1 });
  });

  it("ignores a detection centred in the padding", () => {
    const layout = tileLayout(1280, 720);
    const det: Detection = { x: 630, y: 10, w: 8, h: 8, score: 0.9, kps: Array(10).fill(0) };
    if (layout.fw < 634) expect(splitTiles([det], layout)[0]).toHaveLength(0);
  });
});

describe("mergeWindows", () => {
  it("pads, clamps and merges overlapping clip windows", () => {
    expect(mergeWindows([{ start: 10, end: 20 }, { start: 22, end: 30 }, { start: 100, end: 199 }], 200, 3))
      .toEqual([{ start: 7, end: 33 }, { start: 97, end: 200 }]);
  });
});

describe("trackWindow", () => {
  const det = (cx: number): Detection => ({ x: cx - 0.05, y: 0.2, w: 0.1, h: 0.2, score: 0.9, kps: [] });

  it("keeps one id for one person and a second id for another", () => {
    const frames = [0, 0.25, 0.5, 0.75].map((t) => ({ t, dets: [det(0.3), det(0.7)], cut: false }));
    const boxes = trackWindow(frames, "w0-", 1280, 720);
    const ids = new Set(boxes.map((b) => b.trackId));
    expect(ids.size).toBe(2);
    expect(new Set(boxes.filter((b) => b.x < 0.5).map((b) => b.trackId)).size).toBe(1);
  });

  it("starts new identities at a cut, even at the same position", () => {
    // Host at 0.64, then a cut to the guest at the same place.
    const frames = [
      { t: 0, dets: [det(0.64)], cut: false },
      { t: 0.25, dets: [det(0.64)], cut: false },
      { t: 0.5, dets: [det(0.645)], cut: true },
      { t: 0.75, dets: [det(0.645)], cut: false },
    ];
    const boxes = trackWindow(frames, "w0-", 1280, 720);
    expect(boxes[0].trackId).toBe(boxes[1].trackId);
    expect(boxes[2].trackId).not.toBe(boxes[1].trackId);
    expect(boxes[3].trackId).toBe(boxes[2].trackId);
  });

  it("ends a track after a long gap", () => {
    const frames = [{ t: 0, dets: [det(0.5)], cut: false }, { t: 5, dets: [det(0.5)], cut: false }];
    const boxes = trackWindow(frames, "w0-", 1280, 720);
    expect(boxes[0].trackId).not.toBe(boxes[1].trackId);
  });
});

describe("yawFromLandmarks", () => {
  it("is negative when the nose sits right of the eyes (facing the viewer's right)", () => {
    // eyes at 0.40/0.50, nose at 0.49
    expect(yawFromLandmarks([0.4, 0.3, 0.5, 0.3, 0.49, 0.35, 0, 0, 0, 0], 1000, 1000)!).toBeLessThan(0);
    expect(yawFromLandmarks([0.4, 0.3, 0.5, 0.3, 0.41, 0.35, 0, 0, 0, 0], 1000, 1000)!).toBeGreaterThan(0);
    expect(Math.abs(yawFromLandmarks([0.4, 0.3, 0.5, 0.3, 0.45, 0.35, 0, 0, 0, 0], 1000, 1000)!)).toBeLessThan(1);
  });
});

describe("cut detection thumbnails", () => {
  it("scores identical frames 0 and different frames high", () => {
    const fw = 64, fh = 36;
    const a = new Uint8Array(fw * fh * 3).fill(40), b = new Uint8Array(fw * fh * 3).fill(200);
    expect(thumbDiff(lumaThumb(a, fw, fh), lumaThumb(a, fw, fh))).toBe(0);
    expect(thumbDiff(lumaThumb(a, fw, fh), lumaThumb(b, fw, fh))).toBeGreaterThan(100);
  });
});

// The real model on a real face: a 2-second video of the podcast demo poster
// (the guest sits right of centre, face around x = 0.62).
describe("detectFacesLocal (YuNet, end to end)", () => {
  it("finds and tracks the face in the podcast poster", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yunet-test-"));
    try {
      const video = path.join(dir, "poster.mp4");
      await runFFmpegArgs([
        "-y", "-loop", "1", "-i", path.join(process.cwd(), "public", "samples", "podcast.webp"),
        "-t", "2", "-r", "10", "-vf", "scale=1280:720,format=yuv420p", "-c:v", "libx264", "-preset", "ultrafast", video,
      ], 60_000);
      const r = await detectFacesLocal(video, [{ start: 0, end: 2 }], 2, 1280, 720);
      expect(r.failure).toBeUndefined();
      expect(r.boxes.length).toBeGreaterThanOrEqual(6);
      const cx = r.boxes.reduce((s, b) => s + b.x + b.w / 2, 0) / r.boxes.length;
      expect(cx).toBeGreaterThan(0.55);
      expect(cx).toBeLessThan(0.75);
      // One person, one identity, on a still frame.
      expect(new Set(r.boxes.map((b) => b.trackId)).size).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
