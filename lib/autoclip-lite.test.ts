import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

// Phase 3: the inline lite editor. The pass runs over an ALREADY-RENDERED
// clip, which is the design decision these tests protect — captions and the
// crop path are pixels by then, so a speed change rescales them exactly and
// there is no set of time-indexed artifacts left that could drift.

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b" },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

import {
  liteEditsSchema, parseLiteEdits, planLitePass, speedVideoFilter, fadeFilters,
  atempoChainFor, speechRangesFromWords,
} from "./autoclip-lite";

describe("liteEditsSchema", () => {
  it("accepts a full, valid edit set", () => {
    const parsed = liteEditsSchema.safeParse({
      v: 1,
      speed: 1.25,
      music: { url: "https://example.com/a.mp3", volume: 0.2, startSec: 0, duck: true },
      transition: { fadeInSec: 0.3, fadeOutSec: 0.4 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a speed the editor doesn't offer, so the two surfaces can't drift", () => {
    expect(liteEditsSchema.safeParse({ speed: 1.7 }).success).toBe(false);
    expect(liteEditsSchema.safeParse({ speed: 1.5 }).success).toBe(true);
  });

  it("rejects a B-roll window that ends before it starts", () => {
    expect(liteEditsSchema.safeParse({
      broll: { url: "https://e.com/v.mp4", startSec: 5, endSec: 3, source: "pexels" },
    }).success).toBe(false);
  });

  it("rejects unknown keys rather than silently dropping them", () => {
    expect(liteEditsSchema.safeParse({ speed: 1, nonsense: true }).success).toBe(false);
  });

  it("rejects a music volume outside 0..1", () => {
    expect(liteEditsSchema.safeParse({ music: { url: "https://e.com/a.mp3", volume: 4 } }).success).toBe(false);
  });

  it("parseLiteEdits returns null for junk instead of throwing", () => {
    expect(parseLiteEdits({ speed: "fast" })).toBeNull();
    expect(parseLiteEdits(null)).toBeNull();
  });
});

describe("speedVideoFilter", () => {
  it("scales presentation timestamps by the inverse of the rate", () => {
    expect(speedVideoFilter(2)).toBe("setpts=0.500000*PTS");
  });
  it("is a no-op at 1x", () => {
    expect(speedVideoFilter(1)).toBeNull();
  });
});

describe("atempoChainFor", () => {
  // atempo only accepts 0.5-2.0; anything beyond has to be chained or ffmpeg
  // rejects the graph outright.
  it("uses a single stage inside atempo's supported range", () => {
    expect(atempoChainFor(1.5)).toBe("atempo=1.500000");
  });

  it("chains stages beyond 2x", () => {
    const chain = atempoChainFor(4);
    expect(chain.split(",").length).toBeGreaterThan(1);
    // The stages must multiply back to the requested rate.
    const product = chain.split(",").map((s) => parseFloat(s.split("=")[1])).reduce((a, b) => a * b, 1);
    expect(product).toBeCloseTo(4, 4);
  });

  it("chains stages below 0.5x", () => {
    const chain = atempoChainFor(0.25);
    const product = chain.split(",").map((s) => parseFloat(s.split("=")[1])).reduce((a, b) => a * b, 1);
    expect(product).toBeCloseTo(0.25, 4);
  });
});

describe("fadeFilters", () => {
  it("places the out-fade so it ends with the clip", () => {
    expect(fadeFilters(undefined, 0.5, 10)).toEqual(["fade=t=out:st=9.500:d=0.500"]);
  });
  it("skips an out-fade longer than the clip", () => {
    expect(fadeFilters(undefined, 5, 3)).toEqual([]);
  });
  it("returns nothing when no fades are set", () => {
    expect(fadeFilters(undefined, undefined, 10)).toEqual([]);
  });
});

describe("planLitePass", () => {
  it("reports no work when there is nothing to do", () => {
    expect(planLitePass(null, 10).needed).toBe(false);
    expect(planLitePass({ v: 1 }, 10).needed).toBe(false);
  });

  it("shortens the reported duration when speeding up", () => {
    expect(planLitePass({ v: 1, speed: 2 }, 10).durationSec).toBe(5);
  });

  it("changes both video and audio for a speed change, not just video", () => {
    // Video-only would desync the audio completely.
    const plan = planLitePass({ v: 1, speed: 2 }, 10);
    expect(plan.filterComplex).toContain("setpts=");
    expect(plan.filterComplex).toContain("atempo=");
  });

  it("mixes a music bed and keeps the clip's own length authoritative", () => {
    const plan = planLitePass(
      { v: 1, music: { url: "https://e.com/a.mp3", volume: 0.2, startSec: 0, duck: false } },
      10,
      { musicPath: "/tmp/a.mp3" },
    );
    expect(plan.extraInputs).toEqual(["/tmp/a.mp3"]);
    expect(plan.filterComplex).toContain("amix=inputs=2:duration=first");
    expect(plan.audioMap).toBe("[aout]");
  });

  it("applies a duck envelope to the bed when one is supplied", () => {
    const plan = planLitePass(
      { v: 1, music: { url: "https://e.com/a.mp3", volume: 0.2, startSec: 0, duck: true } },
      10,
      { musicPath: "/tmp/a.mp3", duckExpr: "if(between(t,0,1),0.05,0.2)" },
    );
    expect(plan.filterComplex).toContain("volume='if(between(t,0,1),0.05,0.2)':eval=frame");
  });

  it("ignores a music bed whose file could not be downloaded", () => {
    const plan = planLitePass(
      { v: 1, music: { url: "https://e.com/a.mp3", volume: 0.2, startSec: 0, duck: true } },
      10,
      { musicPath: null },
    );
    expect(plan.needed).toBe(false);
  });
});

describe("speechRangesFromWords", () => {
  it("merges words separated by short gaps into one span", () => {
    const ranges = speechRangesFromWords([
      { word: "a", start: 0, end: 300 },
      { word: "b", start: 400, end: 700 },
    ]);
    expect(ranges).toEqual([{ start: 0, end: 0.7 }]);
  });

  it("splits on a long gap so music can come back up between sentences", () => {
    const ranges = speechRangesFromWords([
      { word: "a", start: 0, end: 300 },
      { word: "b", start: 2000, end: 2300 },
    ]);
    expect(ranges).toHaveLength(2);
  });

  it("handles an empty transcript", () => {
    expect(speechRangesFromWords([])).toEqual([]);
  });
});

// ── Execution ───────────────────────────────────────────────────────────────
// The generated graph is only worth as much as ffmpeg's willingness to run it.

function ffmpegBin(): string | null {
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  return fs.existsSync(local) ? local : null;
}
const FFMPEG = ffmpegBin();
const d = FFMPEG ? describe : describe.skip;

d("lite pass — executed through ffmpeg", () => {
  function runGraph(complex: string, videoMap: string, audioMap: string, extraInputs: string[] = []) {
    const args = [
      "-hide_banner",
      "-f", "lavfi", "-i", "testsrc=s=320x180:r=30:d=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      ...extraInputs.flatMap((i) => ["-f", "lavfi", "-i", i]),
      "-filter_complex", complex,
      "-map", videoMap, "-map", audioMap,
      "-frames:v", "10", "-f", "null", "-",
    ];
    const res = spawnSync(FFMPEG!, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return { code: res.status ?? -1, stderr: res.stderr ?? "" };
  }

  it("renders a speed change", () => {
    // The real pass reads [0:v]/[0:a] from one file; here they're two lavfi
    // inputs, so rewrite the audio label to match.
    const plan = planLitePass({ v: 1, speed: 2 }, 2);
    const complex = plan.filterComplex.replace("[0:a]", "[1:a]");
    const { code, stderr } = runGraph(complex, plan.videoMap, plan.audioMap);
    expect(code, stderr.slice(-2000)).toBe(0);
  });

  it("renders fades", () => {
    const plan = planLitePass({ v: 1, transition: { fadeInSec: 0.2, fadeOutSec: 0.2 } }, 2);
    const complex = plan.filterComplex.replace("[0:a]", "[1:a]");
    const { code, stderr } = runGraph(complex, plan.videoMap, plan.audioMap);
    expect(code, stderr.slice(-2000)).toBe(0);
  });

  it("renders a ducked music mix", () => {
    const plan = planLitePass(
      { v: 1, music: { url: "https://e.com/a.mp3", volume: 0.2, startSec: 0, duck: true } },
      2,
      { musicPath: "music", duckExpr: "if(between(t,0,1),0.05,0.2)" },
    );
    const complex = plan.filterComplex.replace("[0:a]", "[1:a]").replace("[1:a]atrim", "[2:a]atrim");
    const { code, stderr } = runGraph(complex, plan.videoMap, plan.audioMap, ["sine=frequency=220:duration=5"]);
    expect(code, stderr.slice(-2000)).toBe(0);
  });

  it("renders speed and music together", () => {
    const plan = planLitePass(
      { v: 1, speed: 1.5, music: { url: "https://e.com/a.mp3", volume: 0.2, startSec: 0, duck: false } },
      2,
      { musicPath: "music" },
    );
    const complex = plan.filterComplex.replace("[0:a]", "[1:a]").replace("[1:a]atrim", "[2:a]atrim");
    const { code, stderr } = runGraph(complex, plan.videoMap, plan.audioMap, ["sine=frequency=220:duration=5"]);
    expect(code, stderr.slice(-2000)).toBe(0);
  });
});
