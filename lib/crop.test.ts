import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { centeredAspectCrop } from "@/lib/crop";

// CLIPIRO-WEB-14: a re-render of a 20:9 phone recording failed with
// "Invalid too big or non positive size for width '2400' or height '1350'"
// because the 16:9 crop took the full width and derived the height from it.
// Every aspect must fit every frame shape, wide or tall.

function ffmpegBin(): string | null {
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  return fs.existsSync(local) ? local : null;
}
const FFMPEG = ffmpegBin();
const withFfmpeg = FFMPEG ? describe : describe.skip;

/** Output size of `filter` applied to a solid frame of the given size. */
function cropped(size: string, filter: string): { w: number; h: number } {
  const res = spawnSync(
    FFMPEG!,
    ["-hide_banner", "-f", "lavfi", "-i", `color=c=red:s=${size}:d=0.04`, "-filter_complex", `[0:v]${filter}[v]`, "-map", "[v]", "-frames:v", "1", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${res.stderr ?? ""}`);
  // The output stream line is the last "WxH" printed for a video stream.
  const sizes = [...(res.stderr ?? "").matchAll(/Video: [^\n]*?(\d{2,5})x(\d{2,5})/g)];
  const last = sizes[sizes.length - 1];
  return { w: Number(last[1]), h: Number(last[2]) };
}

withFfmpeg("centeredAspectCrop on real ffmpeg", () => {
  const cases: Array<[string, "9:16" | "16:9" | "1:1", { w: number; h: number }]> = [
    // The Sentry frame: wider than 16:9.
    ["2400x1080", "16:9", { w: 1920, h: 1080 }],
    ["2400x1080", "9:16", { w: 606, h: 1080 }],
    ["2400x1080", "1:1", { w: 1080, h: 1080 }],
    // Taller than 9:16.
    ["1080x2400", "16:9", { w: 1080, h: 606 }],
    ["1080x2400", "9:16", { w: 1080, h: 1920 }],
    ["1080x2400", "1:1", { w: 1080, h: 1080 }],
    // The ordinary shapes are unchanged.
    ["1920x1080", "9:16", { w: 606, h: 1080 }],
    ["1080x1920", "16:9", { w: 1080, h: 606 }],
  ];
  it.each(cases)("%s → %s", (size, aspect, want) => {
    expect(cropped(size, centeredAspectCrop(aspect))).toEqual(want);
  });

  it("the old fixed-side 16:9 crop is what failed on a 20:9 frame", () => {
    expect(() => cropped("2400x1080", "crop=in_w:in_w*9/16")).toThrow(/Invalid too big/);
  });
});

describe("centeredAspectCrop", () => {
  it("clamps both sides to the frame and keeps them even", () => {
    expect(centeredAspectCrop("16:9")).toBe("crop=trunc(min(iw\\,ih*16/9)/2)*2:trunc(min(ih\\,iw*9/16)/2)*2");
  });
});
