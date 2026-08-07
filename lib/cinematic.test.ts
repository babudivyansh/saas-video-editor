import { describe, expect, it, vi } from "vitest";

// Phase 2: the cinematic layer. These guard the CONSTRAINTS, which is where
// the difference between "auto-zoom" and "a camera operator" actually lives —
// the signal is easy, the editorial rules are what make motion feel intended.

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b" },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

import {
  rmsEnvelope, normalise, normalisePitch, pauseMap, buildEnergyEnvelope, sampleAt,
  SIGNAL_HZ, type SignalTrack,
} from "./signal-track";
import {
  springSmooth, buildZoomTargets, buildCameraZoom, snapToBeat, applyZoomToKeyframes, ZOOM_STRENGTH_MAX,
} from "./camera-motion";
import {
  classifyScene, groupIntoPeople, buildCutKeyframes, buildGroupKeyframes, buildDriftKeyframes,
} from "./scene-layout";
import { buildAnimatedEvents } from "@/utils/ffmpeg-render";
import type { FaceBox } from "./reframe";

const track = (over: Partial<SignalTrack> = {}): SignalTrack => ({
  v: 1, hz: SIGNAL_HZ, rms: [], pitch: [], energy: [], scenes: [], pauses: [],
  wordsPerSec: 2.5, emphasis: [], ...over,
});

// ── signal-track ────────────────────────────────────────────────────────────

describe("rmsEnvelope", () => {
  it("reports louder windows as higher values", () => {
    const quiet = new Int16Array(1000).fill(100);
    const loud = new Int16Array(1000).fill(10000);
    const pcm = new Int16Array([...quiet, ...loud]);
    const [q, l] = rmsEnvelope(pcm, 1000);
    expect(l).toBeGreaterThan(q * 10);
  });

  it("returns silence as zero", () => {
    expect(rmsEnvelope(new Int16Array(500), 500)[0]).toBe(0);
  });
});

describe("normalise", () => {
  it("scales against a high percentile so one transient can't flatten the rest", () => {
    const values = [...Array(99).fill(0.1), 100];
    const out = normalise(values);
    // The ordinary values keep meaningful range instead of collapsing to ~0.001.
    expect(out[0]).toBeGreaterThan(0.5);
    expect(Math.max(...out)).toBe(1);
  });

  it("handles an all-zero input without dividing by zero", () => {
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("normalisePitch", () => {
  it("marks unvoiced windows as -1 rather than 0, which is a real low pitch", () => {
    const out = normalisePitch([0, 100, 150, 200, 250, 0]);
    expect(out[0]).toBe(-1);
    expect(out[5]).toBe(-1);
    expect(out[3]).toBeGreaterThan(0);
  });

  it("gives up rather than guessing when there is barely any voiced audio", () => {
    expect(normalisePitch([0, 0, 120]).every((v) => v === -1)).toBe(true);
  });
});

describe("pauseMap", () => {
  it("finds gaps between words", () => {
    const pauses = pauseMap([
      { word: "a", start: 0, end: 300 },
      { word: "b", start: 1200, end: 1500 },
    ]);
    expect(pauses).toEqual([{ start: 0.3, end: 1.2 }]);
  });

  it("ignores gaps too short to cut on", () => {
    expect(pauseMap([
      { word: "a", start: 0, end: 300 },
      { word: "b", start: 340, end: 600 },
    ])).toHaveLength(0);
  });
});

describe("buildEnergyEnvelope", () => {
  it("raises energy where the LLM flagged emphasis, even at constant loudness", () => {
    const n = 40;
    const rms = new Array(n).fill(0.4);
    const pitch = new Array(n).fill(0.4);
    const words = [{ word: "big", start: 500, end: 800 }];
    const plain = buildEnergyEnvelope(rms, pitch, words, []);
    const flagged = buildEnergyEnvelope(rms, pitch, words, [0]);
    const at = Math.round(0.6 * SIGNAL_HZ);
    expect(flagged[at]).toBeGreaterThan(plain[at]);
  });

  it("stays within 0..1", () => {
    const out = buildEnergyEnvelope(new Array(20).fill(1), new Array(20).fill(1), [], []);
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});

// ── camera-motion ───────────────────────────────────────────────────────────

describe("springSmooth", () => {
  // The whole reason for a critically-damped spring: it CANNOT overshoot, so
  // "never abrupt, never jittery" is a property of the maths rather than a
  // hope. An under-damped spring would ring past the target and back.
  it("never overshoots a step target", () => {
    const targets = [...Array(10).fill(1), ...Array(60).fill(1.2)];
    const out = springSmooth(targets);
    expect(Math.max(...out)).toBeLessThanOrEqual(1.2 + 1e-6);
  });

  it("eases rather than jumping", () => {
    const targets = [...Array(5).fill(1), ...Array(40).fill(1.2)];
    const out = springSmooth(targets);
    // One frame after the step it is still well short of the target.
    expect(out[6]).toBeLessThan(1.1);
    // And it does get there.
    expect(out[out.length - 1]).toBeGreaterThan(1.19);
  });

  it("stays put when the target never moves", () => {
    const out = springSmooth(new Array(30).fill(1));
    expect(out.every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });
});

describe("snapToBeat", () => {
  it("snaps an onset to the middle of a nearby pause", () => {
    const t = track({ pauses: [{ start: 4.8, end: 5.2 }] });
    expect(snapToBeat(5.15, t)).toBeCloseTo(5.0, 5);
  });

  it("snaps to a shot boundary when one is closer", () => {
    const t = track({ pauses: [{ start: 4.0, end: 4.2 }], scenes: [5.05] });
    expect(snapToBeat(5.1, t)).toBeCloseTo(5.05, 5);
  });

  it("leaves the time alone when there is nothing within the window", () => {
    expect(snapToBeat(5, track({ pauses: [{ start: 0, end: 0.2 }] }))).toBe(5);
  });
});

describe("buildZoomTargets", () => {
  const rising = (n: number) => Array.from({ length: n }, (_, i) => (i < n / 2 ? 0.2 : 0.9));

  it("holds framing steady through the hook and the payoff", () => {
    const duration = 20;
    const energy = new Array(duration * SIGNAL_HZ).fill(0.9);
    const targets = buildZoomTargets(track({ energy }), duration);
    // First 0.8s and last 0.5s must be untouched.
    for (let i = 0; i < 0.8 * SIGNAL_HZ; i++) expect(targets[i]).toBe(1);
    for (let i = Math.round((duration - 0.5) * SIGNAL_HZ); i < targets.length; i++) expect(targets[i]).toBe(1);
  });

  it("does not push in more than once per refractory period", () => {
    const duration = 10;
    const energy = rising(duration * SIGNAL_HZ);
    const targets = buildZoomTargets(track({ energy }), duration, { refractorySec: 4 });
    // Count rising edges away from 1.
    let onsets = 0;
    for (let i = 1; i < targets.length; i++) if (targets[i] > 1 && targets[i - 1] === 1) onsets++;
    expect(onsets).toBeLessThanOrEqual(Math.ceil(duration / 4));
  });

  it("stays at 1 when there is no signal at all", () => {
    expect(buildZoomTargets(track(), 10).every((v) => v === 1)).toBe(true);
  });
});

describe("buildCameraZoom", () => {
  it("respects the zoom-strength ceiling", () => {
    const duration = 15;
    const energy = new Array(duration * SIGNAL_HZ).fill(1);
    const curve = buildCameraZoom(track({ energy }), duration, { maxZoom: ZOOM_STRENGTH_MAX.high });
    expect(Math.max(...curve)).toBeLessThanOrEqual(ZOOM_STRENGTH_MAX.high + 1e-6);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(1);
  });
});

describe("applyZoomToKeyframes", () => {
  it("tightens the window while keeping the subject centred", () => {
    const kf = [{ tSec: 0, x: 0.3, y: 0.1, w: 0.4, h: 0.8 }];
    const out = applyZoomToKeyframes(kf, [2]);
    expect(out[0].w).toBeCloseTo(0.2, 5);
    // Centre preserved: 0.3 + 0.2 = 0.5 before, 0.4 + 0.1 = 0.5 after.
    expect(out[0].x + out[0].w / 2).toBeCloseTo(kf[0].x + kf[0].w / 2, 5);
  });

  it("clamps the zoomed window inside the frame", () => {
    const kf = [{ tSec: 0, x: 0.0, y: 0.0, w: 1.0, h: 1.0 }];
    const out = applyZoomToKeyframes(kf, [1.5]);
    expect(out[0].x).toBeGreaterThanOrEqual(0);
    expect(out[0].x + out[0].w).toBeLessThanOrEqual(1.0001);
  });
});

// ── scene-layout ────────────────────────────────────────────────────────────

function person(id: string, x: number, count = 40, speaking?: number): FaceBox[] {
  return Array.from({ length: count }, (_, i) => ({
    tSec: (i / count) * 20, x, y: 0.2, w: 0.12, h: 0.25, confidence: 95,
    trackId: id, ...(speaking != null ? { speaking } : {}),
  }));
}

describe("classifyScene", () => {
  it("calls a single tracked face a single-speaker scene", () => {
    expect(classifyScene(person("a", 0.4), 0, 20).type).toBe("single");
  });

  it("calls two consistently-present people with little switching a duo", () => {
    const faces = [...person("a", 0.15, 40, 0.9), ...person("b", 0.75, 40, 0.1)];
    const scene = classifyScene(faces, 0, 20);
    expect(scene.people).toBe(2);
    expect(scene.type).toBe("duo");
  });

  it("calls rapid back-and-forth a dialogue, which cuts rather than splits", () => {
    // Alternate who is speaking every half second.
    const faces: FaceBox[] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * 20;
      const aTalks = Math.floor(i / 1) % 2 === 0;
      faces.push({ tSec: t, x: 0.15, y: 0.2, w: 0.12, h: 0.25, confidence: 95, trackId: "a", speaking: aTalks ? 0.9 : 0.1 });
      faces.push({ tSec: t, x: 0.75, y: 0.2, w: 0.12, h: 0.25, confidence: 95, trackId: "b", speaking: aTalks ? 0.1 : 0.9 });
    }
    expect(classifyScene(faces, 0, 20).type).toBe("dialogue");
  });

  it("calls three or more people a group", () => {
    const faces = [...person("a", 0.15), ...person("b", 0.5), ...person("c", 0.85)];
    expect(classifyScene(faces, 0, 20).type).toBe("group");
  });

  it("reports no usable face rather than inventing a subject", () => {
    expect(classifyScene([], 0, 20).type).toBe("none");
  });

  it("ignores a passer-by who is only briefly on screen", () => {
    const faces = [...person("a", 0.4), ...person("b", 0.8, 2)];
    expect(classifyScene(faces, 0, 20).people).toBe(1);
  });
});

describe("groupIntoPeople", () => {
  it("groups by track id when the timeline has them", () => {
    expect(groupIntoPeople([...person("a", 0.2, 4), ...person("b", 0.8, 4)])).toHaveLength(2);
  });

  it("falls back to horizontal position when it doesn't", () => {
    const untracked = [...person("a", 0.1, 4), ...person("b", 0.9, 4)].map(({ ...f }) => {
      delete (f as Partial<FaceBox>).trackId;
      return f;
    });
    expect(groupIntoPeople(untracked).length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildCutKeyframes", () => {
  const dialogue = () => {
    const faces: FaceBox[] = [];
    for (let i = 0; i < 60; i++) {
      const t = i * 0.25;
      const aTalks = Math.floor(t / 3) % 2 === 0;
      faces.push({ tSec: t, x: 0.1, y: 0.2, w: 0.12, h: 0.25, confidence: 95, trackId: "a", speaking: aTalks ? 0.9 : 0.05 });
      faces.push({ tSec: t, x: 0.75, y: 0.2, w: 0.12, h: 0.25, confidence: 95, trackId: "b", speaking: aTalks ? 0.05 : 0.9 });
    }
    return faces;
  };

  it("jumps between speakers instead of sweeping across", () => {
    const kf = buildCutKeyframes(dialogue(), 15, 0.3, 1);
    expect(kf.length).toBeGreaterThan(2);
    // A cut is two keyframes ~one frame apart with very different x.
    const jumps = kf.filter((k, i) => i > 0 && k.tSec - kf[i - 1].tSec < 0.1 && Math.abs(k.x - kf[i - 1].x) > 0.2);
    expect(jumps.length).toBeGreaterThan(0);
  });

  it("enforces a minimum shot length so a noisy signal can't strobe", () => {
    const kf = buildCutKeyframes(dialogue(), 15, 0.3, 1, 2);
    // Distinct framings (ignoring the paired hold-frames) must be >= 2s apart.
    const cuts = kf.filter((k, i) => i === 0 || Math.abs(k.x - kf[i - 1].x) > 0.2);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i].tSec - cuts[i - 1].tSec).toBeGreaterThanOrEqual(2 - 1e-6);
    }
  });

  it("returns nothing when there's only one person to cut between", () => {
    expect(buildCutKeyframes(person("a", 0.4), 15, 0.3, 1)).toHaveLength(0);
  });
});

describe("buildGroupKeyframes", () => {
  it("frames the group's centroid and leans toward whoever is speaking", () => {
    const faces = [
      ...person("a", 0.1, 20, 0.95),
      ...person("b", 0.5, 20, 0.05),
      ...person("c", 0.9, 20, 0.05),
    ];
    const kf = buildGroupKeyframes(faces, 20, 0.3, 1);
    expect(kf.length).toBeGreaterThan(1);
    // Centroid is ~0.5; the speaker at 0.1 should pull it left of centre.
    const centre = kf[5].x + 0.15;
    expect(centre).toBeLessThan(0.5);
    expect(centre).toBeGreaterThan(0.2); // but not all the way onto the speaker
  });
});

describe("buildDriftKeyframes", () => {
  it("moves gently and stays inside the frame", () => {
    const kf = buildDriftKeyframes(10, 0.4, 1);
    expect(kf).toHaveLength(2);
    expect(Math.abs(kf[1].x - kf[0].x)).toBeLessThanOrEqual(0.08 + 1e-9);
    for (const k of kf) {
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.x + k.w).toBeLessThanOrEqual(1.0001);
    }
  });
});

// ── caption animation ───────────────────────────────────────────────────────

describe("buildAnimatedEvents", () => {
  const words = Array.from({ length: 8 }, (_, i) => ({ word: `w${i}`, start: i * 400, end: i * 400 + 350 }));
  const colors = { highlight: "&H0000FFFF", base: "&H00FFFFFF" };

  it("eases the active word with \\t rather than stepping its size", () => {
    const out = buildAnimatedEvents(words, colors);
    expect(out).toContain("\\t(");
    expect(out).toContain("Dialogue:");
  });

  // Readability is a hard limit, not a preference: past ~1.25x a word reflows
  // its neighbours and the line jitters.
  it("never scales a word past the readability ceiling", () => {
    const energy = new Array(words.length).fill(1);
    const out = buildAnimatedEvents(words, colors, { energy, emphasis: words.map((_, i) => i) });
    const scales = [...out.matchAll(/\\fscx(\d+)/g)].map((m) => parseInt(m[1], 10));
    expect(Math.max(...scales)).toBeLessThanOrEqual(125);
  });

  it("scales a high-energy word further than a quiet one", () => {
    const quiet = buildAnimatedEvents(words, colors, { energy: new Array(8).fill(0) });
    const loud = buildAnimatedEvents(words, colors, { energy: new Array(8).fill(1) });
    const peak = (s: string) => Math.max(...[...s.matchAll(/\\fscx(\d+)/g)].map((m) => parseInt(m[1], 10)));
    expect(peak(loud)).toBeGreaterThan(peak(quiet));
  });

  it("only glows on genuinely high-energy words", () => {
    expect(buildAnimatedEvents(words, colors, { energy: new Array(8).fill(0.2) })).not.toContain("\\blur");
    expect(buildAnimatedEvents(words, colors, { energy: new Array(8).fill(0.9) })).toContain("\\blur");
  });

  it("shortens lines for fast speech so the viewer isn't reading behind", () => {
    const slow = buildAnimatedEvents(words, colors, { wordsPerSec: 1.5 }).split("\n").filter(Boolean);
    const fast = buildAnimatedEvents(words, colors, { wordsPerSec: 5 }).split("\n").filter(Boolean);
    // Fewer words per line => more lines for the same words.
    expect(fast.length).toBeGreaterThanOrEqual(slow.length);
  });

  it("produces no events for an empty transcript", () => {
    expect(buildAnimatedEvents([], colors)).toBe("");
  });
});

// ── signal remap after trimming ──────────────────────────────────────────────

describe("remapSignalTrack", () => {
  // Silence removal shortens the clip, so an un-remapped envelope would make
  // the camera and captions react to audio that was cut out — drifting further
  // out of sync the more was removed.
  const keeps = [{ startMs: 0, endMs: 1000 }, { startMs: 3000, endMs: 4000 }];

  it("pulls the second kept span's signal forward to where it now plays", async () => {
    const { remapSignalTrack } = await import("./autoclip-pipeline");
    // Energy is 0 through the first second, 1 from 3s onward.
    const energy = Array.from({ length: 4 * SIGNAL_HZ }, (_, i) => (i >= 3 * SIGNAL_HZ ? 1 : 0));
    const out = remapSignalTrack(track({ energy }), keeps, 2);
    expect(out.energy).toHaveLength(2 * SIGNAL_HZ);
    expect(out.energy[0]).toBe(0);
    // What was at 3s is now at 1s.
    expect(out.energy[Math.round(1.2 * SIGNAL_HZ)]).toBe(1);
  });

  it("drops shot boundaries that fell inside a removed span", async () => {
    const { remapSignalTrack } = await import("./autoclip-pipeline");
    const out = remapSignalTrack(track({ scenes: [0.5, 2.0, 3.5] }), keeps, 2);
    // 2.0s was cut entirely; 0.5 stays, 3.5 moves to 1.5.
    expect(out.scenes).toEqual([0.5, 1.5]);
  });

  it("leaves a track alone when nothing was trimmed", async () => {
    const { unshiftTime } = await import("./autoclip-pipeline");
    expect(unshiftTime(500, [{ startMs: 0, endMs: 10_000 }])).toBe(500);
  });
});

describe("sampleAt", () => {
  it("interpolates between samples", () => {
    expect(sampleAt([0, 1], 0.5 / SIGNAL_HZ, SIGNAL_HZ)).toBeCloseTo(0.5, 5);
  });
  it("clamps outside the envelope instead of returning undefined", () => {
    expect(sampleAt([0.4, 0.6], -5)).toBe(0.4);
    expect(sampleAt([0.4, 0.6], 9999)).toBe(0.6);
    expect(sampleAt([], 1)).toBe(0);
  });
});
