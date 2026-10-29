// Pure string-level tests of the filtergraph builder — no ffmpeg run needed.
// Focus: effects splice into the per-clip chain, transitions produce a
// tpad+xfade fold that preserves total duration, and docs without either
// keep the exact legacy single-concat graph shape.

import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildFilterGraph, writeTextFiles, type ClipInput } from "./filtergraph";
import type { TextClip, TimelineDoc, VideoClip } from "./types";
import { docDimensions, originalFrame, TRANSITION_DURATION_SEC, validateDoc } from "./types";

function videoClip(overrides: Partial<VideoClip> & { id: string }): VideoClip {
  return {
    type: "video",
    assetId: "asset1",
    timelineStart: 0,
    duration: 4,
    srcIn: 0,
    volume: 1,
    muted: false,
    ...overrides,
  };
}

function doc(video: VideoClip[]): TimelineDoc {
  return {
    version: 1,
    aspect: "9:16",
    fps: 30,
    tracks: { video, text: [], audio: [], image: [], caption: [] },
  };
}

function assetsFor(d: TimelineDoc): Map<string, ClipInput> {
  const m = new Map<string, ClipInput>();
  for (const c of d.tracks.video) m.set(c.assetId, { filePath: `/tmp/${c.assetId}.mp4`, hasAudio: true });
  return m;
}

function build(d: TimelineDoc) {
  return buildFilterGraph({
    doc: d,
    assets: assetsFor(d),
    textFiles: new Map(),
    outputPath: "/tmp/out.mp4",
  });
}

describe("encoder args — P0-2 threads=1 fix", () => {
  it("forces single-threaded libx264, ordered ahead of -c:v (SEV-1 production export outage)", () => {
    const d = doc([videoClip({ id: "c1" })]);
    const { args } = build(d);
    const threadsIdx = args.indexOf("-threads");
    const cvIdx = args.indexOf("-c:v");
    expect(threadsIdx).toBeGreaterThanOrEqual(0);
    expect(args[threadsIdx + 1]).toBe("1");
    expect(cvIdx).toBeGreaterThan(threadsIdx);
  });
});

describe("effects", () => {
  it("splices the effect filter into the clip's video chain", () => {
    const d = doc([videoClip({ id: "c1", effect: "chromaticAberration" })]);
    const { filterComplex } = build(d);
    expect(filterComplex).toContain("rgbashift=rh=4:bh=-4");
  });

  it("uses concrete output dimensions for dimension-aware effects", () => {
    const d = doc([videoClip({ id: "c1", effect: "shake" })]);
    const { filterComplex } = build(d);
    // 9:16 output is 1080x1920 — the shake crop must target those dims
    expect(filterComplex).toMatch(/crop=1080:1920:x='\(iw-1080\)/);
  });

  it("adds nothing for effect 'none' or unset", () => {
    const plain = build(doc([videoClip({ id: "c1" })])).filterComplex;
    const none = build(doc([videoClip({ id: "c1", effect: "none" })])).filterComplex;
    expect(none).toBe(plain);
    expect(plain).not.toContain("rgbashift");
    expect(plain).not.toContain("zoompan");
  });
});

describe("transitions", () => {
  const twoClips = (transitionOut?: VideoClip["transitionOut"]) =>
    doc([
      videoClip({ id: "c1", duration: 4, transitionOut }),
      videoClip({ id: "c2", assetId: "asset2", timelineStart: 4, duration: 3 }),
    ]);

  it("keeps the legacy interleaved concat when no transitions are set", () => {
    const { filterComplex } = build(twoClips());
    expect(filterComplex).toContain("concat=n=2:v=1:a=1[vbase][abase]");
    expect(filterComplex).not.toContain("xfade");
    expect(filterComplex).not.toContain("tpad");
  });

  it("emits tpad + xfade at the boundary and preserves total duration", () => {
    const result = build(twoClips("fade"));
    const fc = result.filterComplex;
    expect(fc).toContain(`tpad=stop_mode=clone:stop_duration=${TRANSITION_DURATION_SEC}`);
    // offset = end of the first clip (4s), duration = 0.5s
    expect(fc).toContain(`xfade=transition=fade:duration=${TRANSITION_DURATION_SEC}:offset=4`);
    // audio joins as a plain hard-cut concat (timings unchanged)
    expect(fc).toContain("concat=n=2:v=0:a=1[abase]");
    // total output duration unchanged by the transition
    expect(result.durationSec).toBe(7);
    expect(result.args[result.args.indexOf("-t") + 1]).toBe("7");
  });

  it("normalizes segments for xfade (format + settb) only when transitions exist", () => {
    expect(build(twoClips("dipToBlack")).filterComplex).toContain("settb=AVTB");
    expect(build(twoClips()).filterComplex).not.toContain("settb=AVTB");
  });

  it("maps preset names to xfade transition names", () => {
    expect(build(twoClips("dipToBlack")).filterComplex).toContain("xfade=transition=fadeblack");
    expect(build(twoClips("slideLeft")).filterComplex).toContain("xfade=transition=slideleft");
    expect(build(twoClips("wipe")).filterComplex).toContain("xfade=transition=wipeleft");
  });

  it("falls back to a hard cut for unsupported presets (zoomOut) and 'none'", () => {
    for (const t of ["zoomOut", "none"] as const) {
      const fc = build(twoClips(t)).filterComplex;
      expect(fc).not.toContain("xfade");
    }
  });

  it("ignores a transition set on the last clip", () => {
    const d = doc([videoClip({ id: "c1", duration: 4, transitionOut: "fade" })]);
    const fc = build(d).filterComplex;
    expect(fc).not.toContain("xfade");
  });

  it("clamps the crossfade to the incoming clip's duration", () => {
    const d = doc([
      videoClip({ id: "c1", duration: 4, transitionOut: "fade" }),
      videoClip({ id: "c2", assetId: "asset2", timelineStart: 4, duration: 0.3 }),
    ]);
    const fc = build(d).filterComplex;
    expect(fc).toContain("xfade=transition=fade:duration=0.3:offset=4");
  });

  it("handles three clips with mixed boundaries", () => {
    const d = doc([
      videoClip({ id: "c1", duration: 2, transitionOut: "fade" }),
      videoClip({ id: "c2", assetId: "asset2", timelineStart: 2, duration: 3 }),
      videoClip({ id: "c3", assetId: "asset3", timelineStart: 5, duration: 1 }),
    ]);
    const result = build(d);
    const fc = result.filterComplex;
    // fade at boundary 1 (offset 2), hard cut (pairwise concat) at boundary 2
    expect(fc).toContain("xfade=transition=fade:duration=0.5:offset=2");
    expect(fc).toContain("concat=n=2:v=1:a=0");
    expect(fc).toContain("concat=n=3:v=0:a=1[abase]");
    expect(result.durationSec).toBe(6);
  });
});

describe("text keyframes", () => {
  it("animates x, y, size and opacity with expressions in t", () => {
    const d = doc([videoClip({ id: "v1" })]);
    d.tracks.text = [{
      id: "t1", type: "text", text: "Hi", timelineStart: 1, duration: 3, fontFamily: "Poppins", fontSizePct: 0.05,
      color: "#ffffff", bold: false, align: "center", x: 0.5, y: 0.5, bgColor: null,
      keyframes: [{ t: 0, x: 0.2, y: 0.5, scale: 1, opacity: 0 }, { t: 2, x: 0.8, y: 0.5, scale: 2, opacity: 1 }],
    }];
    const fc = buildFilterGraph({ doc: d, assets: assetsFor(d), textFiles: new Map([["t1", "/tmp/t1.txt"]]), outputPath: "/tmp/out.mp4" })
      .args[buildFilterGraph({ doc: d, assets: assetsFor(d), textFiles: new Map([["t1", "/tmp/t1.txt"]]), outputPath: "/tmp/out.mp4" }).args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("x='(w*(if(lt(t,1),0.2,if(lt(t,3),0.2+(0.6)*(t-1)/2,0.8))))-(text_w/2)'");
    expect(fc).toMatch(/fontsize='[\d.]+\*\(if\(lt\(t,1\),1,/);
    expect(fc).toContain("alpha='if(lt(t,1),0,");
  });
});

describe("effect window, strength and colour fine-tune", () => {
  const fcOf = (d: TimelineDoc) => { const a = build(d).args; return a[a.indexOf("-filter_complex") + 1]; };

  it("wraps a part-clip effect in split/blend with an enable window", () => {
    const fc = fcOf(doc([videoClip({ id: "v1", effect: "filmGrain", effectStart: 1, effectEnd: 2, effectStrength: 0.5 })]));
    expect(fc).toMatch(/split\[\w+o\]\[\w+f\];\[\w+f\]noise=alls=12:allf=t\+u\[\w+e\];\[\w+o\]\[\w+e\]blend=all_expr='A\+\(B-A\)\*0\.5':enable='between\(t,1,2\)'/);
  });

  it("keeps the plain chain for a whole-clip, full-strength effect", () => {
    expect(fcOf(doc([videoClip({ id: "v1", effect: "filmGrain" })]))).not.toContain("blend=");
  });

  it("adds eq/colorbalance for the fine-tune", () => {
    const fc = fcOf(doc([videoClip({ id: "v1", adjust: { brightness: 0.1, contrast: 1, saturation: 1.2, warmth: 0.4 } })]));
    expect(fc).toContain("eq=brightness=0.1:contrast=1:saturation=1.2");
    expect(fc).toContain("colorbalance=rm=0.06");
  });
});

describe("untrusted doc values never reach the filesystem or the filtergraph raw", () => {
  const textClip = (over: Partial<TextClip> = {}): TextClip => ({
    id: "t1", type: "text", text: "Hi", timelineStart: 0, duration: 2, fontFamily: "Poppins", fontSizePct: 0.05,
    color: "#ffffff", bold: false, align: "center", x: 0.5, y: 0.5, bgColor: null, ...over,
  });

  it("names text files by position, so a path-like clip id cannot escape the temp dir", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fg-"));
    try {
      const d = doc([videoClip({ id: "v1" })]);
      d.tracks.text = [textClip({ id: "/../../../../tmp/pwned" })];
      const map = writeTextFiles(d, dir, "job");
      const written = map.get("/../../../../tmp/pwned")!;
      expect(written).toBe(path.join(dir, "job-text-0.txt"));
      expect(fs.readdirSync(dir)).toEqual(["job-text-0.txt"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validateDoc rejects a path-like clip id and accepts uuids and mobile ids", () => {
    const d = doc([videoClip({ id: "v1" })]);
    d.tracks.text = [textClip({ id: "../evil" })];
    expect(validateDoc(d)).toBe("text: invalid clip id");
    d.tracks.text = [textClip({ id: "3f2b6c1e-8a4d-4f0e-9b7a-2c5d1e6f7a8b" }), textClip({ id: "mlx3k2a0q1z9" })];
    expect(validateDoc(d)).toBeNull();
  });

  it.each(["color", "bgColor", "strokeColor"] as const)("refuses to build a graph with an injected %s", (field) => {
    const d = doc([videoClip({ id: "v1" })]);
    d.tracks.text = [textClip({ [field]: "#ffffff:textfile=/proc/self/environ" })];
    expect(() => buildFilterGraph({ doc: d, assets: assetsFor(d), textFiles: new Map([["t1", "/tmp/t1.txt"]]), outputPath: "/tmp/out.mp4" }))
      .toThrow("invalid colour");
  });

  it("refuses an injected shadow colour", () => {
    const d = doc([videoClip({ id: "v1" })]);
    d.tracks.text = [textClip({ shadow: { color: "#000000,drawtext=text=x", opacity: 0.5, offsetXPct: 0.01, offsetYPct: 0.01 } as TextClip["shadow"] })];
    expect(() => buildFilterGraph({ doc: d, assets: assetsFor(d), textFiles: new Map([["t1", "/tmp/t1.txt"]]), outputPath: "/tmp/out.mp4" }))
      .toThrow("invalid colour");
  });
});

describe("frame sizes: 4:5 and original", () => {
  it("renders 4:5 at 1080x1350", () => {
    const d: TimelineDoc = { ...doc([videoClip({ id: "c1" })]), aspect: "4:5" };
    expect(validateDoc(d)).toBeNull();
    expect(build(d).filterComplex).toContain("scale=1080:1350:force_original_aspect_ratio=increase");
  });

  it("renders original at doc.size", () => {
    const d: TimelineDoc = { ...doc([videoClip({ id: "c1" })]), aspect: "original", size: { w: 1920, h: 816 } };
    expect(validateDoc(d)).toBeNull();
    expect(docDimensions(d)).toEqual({ w: 1920, h: 816 });
    expect(build(d).filterComplex).toContain("crop=1920:816");
  });

  it("refuses original without a usable size", () => {
    const base = doc([videoClip({ id: "c1" })]);
    expect(validateDoc({ ...base, aspect: "original" })).toBe("invalid size");
    expect(validateDoc({ ...base, aspect: "original", size: { w: 1081, h: 1920 } })).toBe("invalid size");
    expect(validateDoc({ ...base, aspect: "original", size: { w: 4000, h: 1920 } })).toBe("invalid size");
    expect(validateDoc({ ...base, aspect: "original", size: { w: 1920, h: 240 } })).toBe("invalid size");
    expect(validateDoc({ ...base, aspect: "2:3" as TimelineDoc["aspect"] })).toBe("invalid aspect");
  });

  it("originalFrame scales the long side to 1920, keeps sides even and clamps extreme shapes", () => {
    expect(originalFrame(3840, 2160)).toEqual({ w: 1920, h: 1080 });
    expect(originalFrame(720, 1280)).toEqual({ w: 1080, h: 1920 });
    expect(originalFrame(1000, 1001)).toEqual({ w: 1918, h: 1920 });
    const strip = originalFrame(5000, 100);
    expect(strip).toEqual({ w: 1920, h: 480 });
    // Whatever the source, the result always validates.
    for (const [w, h] of [[3840, 2160], [1, 1], [0, 0], [100, 5000], [1279, 719]]) {
      const size = originalFrame(w, h);
      expect(validateDoc({ ...doc([videoClip({ id: "c1" })]), aspect: "original", size })).toBeNull();
    }
  });
});

describe("framing: fill focus and fit", () => {
  it("keeps the legacy centred crop when no focus is set", () => {
    const { filterComplex } = build(doc([videoClip({ id: "c1" })]));
    expect(filterComplex).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1");
  });

  it("offsets the crop by focusX/focusY", () => {
    const { filterComplex } = build(doc([videoClip({ id: "c1", focusX: 0.2, focusY: 1 })]));
    expect(filterComplex).toContain("crop=1080:1920:x=(in_w-out_w)*0.2:y=(in_h-out_h)*1");
  });

  it("fit splits into a blurred cover copy and a contained copy, then overlays them", () => {
    const { filterComplex } = build(doc([videoClip({ id: "c1", fit: "fit", focusX: 0.9 })]));
    expect(filterComplex).toContain("fps=30,split[v0s1][v0s2]");
    expect(filterComplex).toContain("[v0s1]scale=136:240:force_original_aspect_ratio=increase,crop=136:240,boxblur=6:2,scale=1080:1920,setsar=1[v0bg]");
    expect(filterComplex).toContain("[v0s2]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[v0fg]");
    expect(filterComplex).toContain("[v0bg][v0fg]overlay=(W-w)/2:(H-h)/2[v0fit]");
    expect(filterComplex).toContain("[v0fit]setsar=1");
    // Focus only applies to fill.
    expect(filterComplex).not.toContain("in_w-out_w");
  });

  it("fit still takes effects, fades and the part-clip effect wrapper", () => {
    const { filterComplex } = build(doc([videoClip({ id: "c1", fit: "fit", fadeIn: 1, effect: "glitch", effectStart: 1, effectEnd: 2 })]));
    expect(filterComplex).toContain("[v0fit]setsar=1[v0p]");
    expect(filterComplex).toContain("fade=t=in:st=0:d=1");
  });

  it("validates fit and focus values", () => {
    expect(validateDoc(doc([videoClip({ id: "c1", fit: "fit", focusX: 0, focusY: 1 })]))).toBeNull();
    expect(validateDoc(doc([videoClip({ id: "c1", fit: "zoom" as VideoClip["fit"] })]))).toBe("video clip invalid fit");
    expect(validateDoc(doc([videoClip({ id: "c1", focusX: 1.5 })]))).toBe("video clip invalid focusX");
    expect(validateDoc(doc([videoClip({ id: "c1", focusY: -0.1 })]))).toBe("video clip invalid focusY");
  });
});
