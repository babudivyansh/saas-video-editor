import { describe, expect, it, vi } from "vitest";

// lib/reframe.ts imports @/lib/env (for AWS_* config) purely to construct the
// Rekognition SDK client at module scope — that client never makes a network
// call in these tests (they only exercise the pure geometry/expression-
// building functions), but importing the real env.ts would still require
// every required env var to be set. Mock it instead of loading dotenv.
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));

import {
  parseS3Url,
  computeCropKeyframesForClip,
  computeMultiSpeakerKeyframes,
  buildDynamicCropFilter,
  buildZoomEnvelope,
  buildSplitScreenFilterComplex,
  type FaceBox,
} from "./reframe";

describe("parseS3Url", () => {
  it("extracts bucket and key from a standard S3 URL", () => {
    expect(parseS3Url("https://my-bucket.s3.us-east-1.amazonaws.com/renders/proj/clip-0.mp4"))
      .toEqual({ bucket: "my-bucket", key: "renders/proj/clip-0.mp4" });
  });

  it("URL-decodes the key", () => {
    expect(parseS3Url("https://b.s3.ap-south-1.amazonaws.com/a%20b/c.mp4"))
      .toEqual({ bucket: "b", key: "a b/c.mp4" });
  });

  it("returns null for a non-S3 URL", () => {
    expect(parseS3Url("https://example.com/video.mp4")).toBeNull();
  });
});

function face(tSec: number, x: number, confidence = 90): FaceBox {
  return { tSec, x, y: 0.1, w: 0.15, h: 0.3, confidence };
}

describe("computeCropKeyframesForClip", () => {
  it("returns null when there is no face data in the clip window", () => {
    // smartAutoReframe defaults to on in production (a zoom envelope even
    // without face data) — disable it to exercise the base pan-only path.
    expect(computeCropKeyframesForClip([], 0, 10, "9:16", 1920, 1080, { smartAutoReframe: false })).toBeNull();
  });

  it("returns null when the aspect already spans the full source (nothing to pan)", () => {
    // A source that's already exactly 9:16 has no room to pan horizontally.
    const faces = [face(1, 0.3), face(3, 0.3)];
    expect(computeCropKeyframesForClip(faces, 0, 10, "9:16", 1080, 1920, { smartAutoReframe: false })).toBeNull();
  });

  it("tracks a face that moves across the frame with a pan path", () => {
    const faces = [face(0.5, 0.1), face(5, 0.5), face(9.5, 0.8)];
    const kf = computeCropKeyframesForClip(faces, 0, 10, "9:16", 1920, 1080);
    expect(kf).not.toBeNull();
    expect(kf!.length).toBeGreaterThan(1);
    // Keyframe times are clip-relative (start at/near 0, not the absolute 0.5).
    expect(kf![0].tSec).toBeGreaterThanOrEqual(0);
    // x should generally increase as the face moves right.
    expect(kf![kf!.length - 1].x).toBeGreaterThan(kf![0].x);
  });

  it("clamps the crop window inside frame bounds when panning toward an edge", () => {
    // Starts centered, drifts to hug the left edge (x=0) — real movement, so
    // it isn't collapsed as "unmoving", and it exercises the x>=0 clamp.
    const faces = [face(0.5, 0.4), face(3, 0.2), face(6, 0.05), face(9.5, 0.0)];
    const kf = computeCropKeyframesForClip(faces, 0, 10, "9:16", 1920, 1080);
    expect(kf).not.toBeNull();
    for (const k of kf!) {
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.x + k.w).toBeLessThanOrEqual(1.0001);
    }
  });

  it("returns null for a face that never moves (no better than the static crop)", () => {
    const faces = Array.from({ length: 20 }, (_, i) => face(i * 0.5, 0.4));
    expect(computeCropKeyframesForClip(faces, 0, 10, "9:16", 1920, 1080, { smartAutoReframe: false })).toBeNull();
  });

  it("ignores faces outside the clip's time window", () => {
    const faces = [face(100, 0.1), face(200, 0.9)]; // way outside [0,10]
    expect(computeCropKeyframesForClip(faces, 0, 10, "9:16", 1920, 1080, { smartAutoReframe: false })).toBeNull();
  });

  it("ignores low-confidence detections", () => {
    const faces = [face(1, 0.1, 10), face(5, 0.5, 20), face(9, 0.9, 15)];
    expect(computeCropKeyframesForClip(faces, 0, 10, "9:16", 1920, 1080, { smartAutoReframe: false })).toBeNull();
  });
});

describe("computeMultiSpeakerKeyframes", () => {
  function twoSpeakers(n: number): FaceBox[] {
    const faces: FaceBox[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 10;
      faces.push({ tSec: t, x: 0.05, y: 0.2, w: 0.1, h: 0.3, confidence: 95 }); // left speaker
      faces.push({ tSec: t, x: 0.75, y: 0.2, w: 0.1, h: 0.3, confidence: 95 }); // right speaker
    }
    return faces;
  }

  it("detects two consistently-separated speakers and returns two independent tracks", () => {
    const result = computeMultiSpeakerKeyframes(twoSpeakers(10), 0, 10, 1920, 1080);
    expect(result).not.toBeNull();
    expect(result!.a.length).toBeGreaterThan(0);
    expect(result!.b.length).toBeGreaterThan(0);
  });

  it("returns null for a single speaker moving around (not two distinct people)", () => {
    const faces: FaceBox[] = Array.from({ length: 10 }, (_, i) => face((i / 10) * 10, 0.3 + i * 0.01));
    expect(computeMultiSpeakerKeyframes(faces, 0, 10, 1920, 1080)).toBeNull();
  });

  it("returns null when there isn't enough face data to trust a 2-cluster split", () => {
    expect(computeMultiSpeakerKeyframes([face(1, 0.1), face(5, 0.8)], 0, 10, 1920, 1080)).toBeNull();
  });

  it("returns null when one side only appears briefly (not a real two-speaker scene)", () => {
    const faces: FaceBox[] = [];
    for (let i = 0; i < 10; i++) faces.push(face((i / 10) * 10, 0.05, 95));
    faces.push({ tSec: 0.1, x: 0.8, y: 0.2, w: 0.1, h: 0.3, confidence: 95 }); // single brief appearance
    expect(computeMultiSpeakerKeyframes(faces, 0, 10, 1920, 1080)).toBeNull();
  });
});

describe("buildZoomEnvelope", () => {
  it("returns keyframes that start and end at the base (unzoomed) size", () => {
    const kf = buildZoomEnvelope(10, "9:16", 1920, 1080);
    expect(kf.length).toBeGreaterThan(2);
    expect(kf[0].w).toBeCloseTo(kf[kf.length - 1].w, 5);
  });

  it("shrinks the crop window at the midpoint (zoom-in) relative to the ends", () => {
    const kf = buildZoomEnvelope(10, "9:16", 1920, 1080);
    const mid = kf[Math.floor(kf.length / 2)];
    expect(mid.w).toBeLessThan(kf[0].w);
  });

  it("keeps the window centered at every keyframe", () => {
    const kf = buildZoomEnvelope(10, "9:16", 1920, 1080);
    for (const k of kf) {
      expect(k.x + k.w / 2).toBeCloseTo(0.5, 5);
      expect(k.y + k.h / 2).toBeCloseTo(0.5, 5);
    }
  });
});

describe("buildDynamicCropFilter", () => {
  it("produces a pan-only crop (no scale) when keyframe size is constant", () => {
    const kf = [{ tSec: 0, x: 0.1, y: 0, w: 0.5, h: 1 }, { tSec: 5, x: 0.3, y: 0, w: 0.5, h: 1 }];
    const filter = buildDynamicCropFilter(kf, "9:16");
    expect(filter).toContain("crop=");
    expect(filter).not.toContain("scale=");
  });

  // Zoom used to be attempted with a time-varying crop w/h plus a trailing
  // `scale=`. That silently did nothing: crop evaluates w/h once at config
  // time. Zoom now goes through zoompan, which pins the output size itself via
  // `s=` — see lib/reframe.render.test.ts, which proves the motion is real by
  // running ffmpeg rather than inspecting the string.
  it("pins a fixed output resolution when keyframe size varies (zoom), so output frame size stays constant", () => {
    const kf = buildZoomEnvelope(10, "9:16", 1920, 1080);
    const filter = buildDynamicCropFilter(kf, "9:16");
    expect(filter).toContain("zoompan=");
    expect(filter).toContain("s=1080x1920");
  });

  it("keeps the time-varying zoom out of crop's w/h, which ffmpeg evaluates only once", () => {
    const filter = buildDynamicCropFilter(buildZoomEnvelope(10, "9:16", 1920, 1080), "9:16");
    const cropArgs = /crop=w='([^']*)':h='([^']*)'/.exec(filter);
    expect(cropArgs).not.toBeNull();
    expect(cropArgs![1]).not.toMatch(/\bt\b/);
    expect(cropArgs![2]).not.toMatch(/\bt\b/);
  });

  it("does not emit an eval= option (crop has no such option — ffmpeg rejects the filtergraph if present; x/y are already re-evaluated every frame when they reference t)", () => {
    const kf = [{ tSec: 0, x: 0.1, y: 0, w: 0.5, h: 1 }, { tSec: 5, x: 0.3, y: 0, w: 0.5, h: 1 }];
    expect(buildDynamicCropFilter(kf, "9:16")).not.toContain("eval=");
  });

  it("references t in the x expression so it actually varies over time", () => {
    const kf = [{ tSec: 0, x: 0.1, y: 0, w: 0.5, h: 1 }, { tSec: 5, x: 0.3, y: 0, w: 0.5, h: 1 }];
    expect(buildDynamicCropFilter(kf, "9:16")).toMatch(/x='[^']*\bt\b[^']*'/);
  });
});

describe("buildSplitScreenFilterComplex", () => {
  const kfA = [{ tSec: 0, x: 0.05, y: 0, w: 0.3, h: 1 }, { tSec: 5, x: 0.1, y: 0, w: 0.3, h: 1 }];
  const kfB = [{ tSec: 0, x: 0.6, y: 0, w: 0.3, h: 1 }, { tSec: 5, x: 0.65, y: 0, w: 0.3, h: 1 }];

  it("builds a vstack of two independently-cropped halves", () => {
    const fc = buildSplitScreenFilterComplex(kfA, kfB, null, null);
    expect(fc).toContain("[top]");
    expect(fc).toContain("[bot]");
    expect(fc).toContain("vstack=inputs=2");
    expect(fc).toContain("[video]");
  });

  it("chains mood and caption filters after the stack, not before", () => {
    const fc = buildSplitScreenFilterComplex(kfA, kfB, "eq=saturation=1.5", "subtitles='x.ass'");
    const stackIdx = fc.indexOf("vstack");
    const moodIdx = fc.indexOf("eq=saturation=1.5");
    const capIdx = fc.indexOf("subtitles=");
    expect(moodIdx).toBeGreaterThan(stackIdx);
    expect(capIdx).toBeGreaterThan(moodIdx);
  });
});
