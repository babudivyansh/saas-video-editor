// Runs every new layout graph (full frame, gaming third/two-thirds, picture-in-
// picture, fixed split) through the bundled ffmpeg on a synthetic 1080p source
// and checks the output is a real 1080x1920 frame. A filter string can look
// right and still be rejected by ffmpeg; only running it proves it renders.
import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b" } }));

import { buildLayoutFilterComplex, fixedSplitLayout, gamingLayoutFromCam, pipLayoutFromCam, type StoredCrop } from "./reframe";

const bin = path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const d = fs.existsSync(bin) ? describe : describe.skip;

function render(stored: StoredCrop): { w: number; h: number } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-"));
  const out = path.join(dir, "f.png");
  const graph = buildLayoutFilterComplex(stored, "9:16", "eq=saturation=1.05", "[0:v]");
  expect(graph).not.toBeNull();
  const res = spawnSync(bin, [
    "-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=2",
    "-filter_complex", graph!, "-map", "[video]", "-frames:v", "1", out,
  ], { encoding: "utf8" });
  expect(res.status, (res.stderr ?? "").slice(-1500)).toBe(0);
  const probe = spawnSync(bin, ["-hide_banner", "-i", out], { encoding: "utf8" });
  const m = /(\d{3,4})x(\d{3,4})/.exec(probe.stderr ?? "");
  fs.rmSync(dir, { recursive: true, force: true });
  return { w: Number(m?.[1]), h: Number(m?.[2]) };
}

d("layout graphs render with ffmpeg", () => {
  const cam = { x: 0.02, y: 0.02, w: 0.24, h: 0.3 };
  it("full frame", () => expect(render({ mode: "fit" })).toEqual({ w: 1080, h: 1920 }));
  it("gaming third / two thirds", () => expect(render(gamingLayoutFromCam(cam, 1920, 1080, 2)!)).toEqual({ w: 1080, h: 1920 }));
  it("picture-in-picture", () => expect(render(pipLayoutFromCam(cam, 1920, 1080, 2)!)).toEqual({ w: 1080, h: 1920 }));
  it("fixed two-camera split", () => expect(render(fixedSplitLayout(1920, 1080, 2)!)).toEqual({ w: 1080, h: 1920 }));
}, 60_000);
